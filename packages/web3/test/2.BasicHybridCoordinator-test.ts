import { expect } from "chai";
import { ethers } from "hardhat";
import { zeroPadValue, toBeHex, keccak256, toUtf8Bytes } from "ethers";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import {
  BasicHybridCoordinator,
  BasicHybridCoordinator__factory,
  ExampleConsumer,
  ExampleConsumer__factory,
} from "../typechain-types";

describe("BasicHybridCoordinator TEST", function () {
  let coordinator: BasicHybridCoordinator;
  let consumer: ExampleConsumer;
  let deployer: HardhatEthersSigner;
  let consumerAccount: HardhatEthersSigner;
  let processorAccount: HardhatEthersSigner;
  let unauthorizedAccount: HardhatEthersSigner;

  const CONSUMER_ROLE = keccak256(toUtf8Bytes("CONSUMER_ROLE"));
  const PROCESSOR_ROLE = keccak256(toUtf8Bytes("PROCESSOR_ROLE"));
  const DEFAULT_ADMIN_ROLE =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  const BYTECODE_LOCATION = "ipfs://Qm123bytecode";
  const CURRENT_STATE_LOCATION = "ipfs://Qm456currentstate";
  const NEW_STATE_LOCATION = "ipfs://Qm789newstate";
  const RETURN_DATA = "0x1234567890abcdef";

  beforeEach(async function () {
    [deployer, consumerAccount, processorAccount, unauthorizedAccount] =
      await ethers.getSigners();

    // Deploy BasicHybridCoordinator
    coordinator = await new BasicHybridCoordinator__factory(deployer).deploy(
      deployer.address
    );
    await coordinator.waitForDeployment();

    // Deploy ExampleConsumer
    consumer = await new ExampleConsumer__factory(deployer).deploy(
      await coordinator.getAddress(),
      BYTECODE_LOCATION,
      CURRENT_STATE_LOCATION
    );
    await consumer.waitForDeployment();

    // Grant roles
    await (await coordinator.grantRole(CONSUMER_ROLE, await consumer.getAddress())).wait();
    await (await coordinator.grantRole(PROCESSOR_ROLE, processorAccount.address)).wait();
  });

  describe("Deployment & Initial State", () => {
    it("should deploy successfully with correct admin", async () => {
      expect(
        await coordinator.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)
      ).to.equal(true);
    });

    it("should have no pending requests initially", async () => {
      expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
    });

    it("consumer should reference coordinator correctly", async () => {
      expect(await consumer.coordinator()).to.equal(await coordinator.getAddress());
    });
  });

  describe("Role Management", () => {
    it("admin can grant CONSUMER_ROLE", async () => {
      await (await coordinator.grantRole(CONSUMER_ROLE, consumerAccount.address)).wait();
      expect(await coordinator.hasRole(CONSUMER_ROLE, consumerAccount.address)).to.equal(true);
    });

    it("admin can grant PROCESSOR_ROLE", async () => {
      const newProcessor = unauthorizedAccount.address;
      await (await coordinator.grantRole(PROCESSOR_ROLE, newProcessor)).wait();
      expect(await coordinator.hasRole(PROCESSOR_ROLE, newProcessor)).to.equal(true);
    });

    it("admin can revoke roles", async () => {
      await (await coordinator.revokeRole(PROCESSOR_ROLE, processorAccount.address)).wait();
      expect(await coordinator.hasRole(PROCESSOR_ROLE, processorAccount.address)).to.equal(false);
    });

    it("non-admin cannot grant roles", async () => {
      await expect(
        coordinator
          .connect(unauthorizedAccount)
          .grantRole(CONSUMER_ROLE, unauthorizedAccount.address)
      )
        .to.be.revertedWithCustomError(coordinator, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorizedAccount.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("sendOffchainCall()", () => {
    it("consumer can send offchain call request", async () => {
      const callData = "0x12345678";

      const txPromise = consumer.requestOffchainExecution(
        callData,
        BYTECODE_LOCATION,
        CURRENT_STATE_LOCATION
      );

      const receipt = await (await txPromise).wait();
      const blockNumber = receipt!.blockNumber;

      const requestId = await coordinator.nextRequest();
      expect(requestId).to.not.equal(zeroPadValue("0x00", 32));

      const nonce = await coordinator.nonce();

      await expect(txPromise)
        .to.emit(coordinator, "OffchainCallSent")
        .withArgs(
          requestId,
          nonce,
          await consumer.getAddress(),
          await deployer.getAddress(),
          blockNumber,
          callData,
          BYTECODE_LOCATION,
          CURRENT_STATE_LOCATION
        );
    });

    it("emits OffchainCallSent event with correct parameters", async () => {
      const callData = "0xabcdef";

      const txPromise = consumer.requestOffchainExecution(
        callData,
        BYTECODE_LOCATION,
        CURRENT_STATE_LOCATION
      );

      const receipt = await (await txPromise).wait();
      const blockNumber = receipt!.blockNumber;

      const requestId = await coordinator.nextRequest();
      const nonce = await coordinator.nonce();

      await expect(txPromise)
        .to.emit(coordinator, "OffchainCallSent")
        .withArgs(
          requestId,
          nonce,
          await consumer.getAddress(),
          await deployer.getAddress(),
          blockNumber,
          callData,
          BYTECODE_LOCATION,
          CURRENT_STATE_LOCATION
        );
    });

    it("generates unique request IDs for different requests", async () => {
      const tx1 = await consumer.requestOffchainExecution(
        "0x01",
        BYTECODE_LOCATION,
        CURRENT_STATE_LOCATION
      );
      await tx1.wait();
      const requestId1 = await coordinator.nextRequest();

      // Fulfill first request to move queue
      await (
        await coordinator
          .connect(processorAccount)
          .replyOffchainCall(requestId1, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      const tx2 = await consumer.requestOffchainExecution(
        "0x02",
        BYTECODE_LOCATION,
        CURRENT_STATE_LOCATION
      );
      await tx2.wait();
      const requestId2 = await coordinator.nextRequest();

      expect(requestId1).to.not.equal(requestId2);
    });

    it("reverts if caller doesn't have CONSUMER_ROLE", async () => {
      await expect(
        coordinator.connect(unauthorizedAccount).sendOffchainCall(
          unauthorizedAccount.address,
          "0x1234",
          BYTECODE_LOCATION,
          CURRENT_STATE_LOCATION
        )
      )
        .to.be.revertedWithCustomError(coordinator, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorizedAccount.address, CONSUMER_ROLE);
    });

    it("reverts if consumer doesn't support IResponseOffchainCallConsumer interface", async () => {
      // Grant role to an EOA (which doesn't support the interface)
      await (await coordinator.grantRole(CONSUMER_ROLE, consumerAccount.address)).wait();

      // EOA has no code -> interface checks will fail/revert without reason
      await expect(
        coordinator.connect(consumerAccount).sendOffchainCall(
          consumerAccount.address,
          "0x1234",
          BYTECODE_LOCATION,
          CURRENT_STATE_LOCATION
        )
      ).to.be.revertedWithoutReason();
    });

    it("stores request data correctly", async () => {
      const callData = "0xdeadbeef";

      await (
        await consumer.requestOffchainExecution(
          callData,
          BYTECODE_LOCATION,
          CURRENT_STATE_LOCATION
        )
      ).wait();

      const requestId = await coordinator.nextRequest();
      const request = await coordinator.getRequest(requestId);

      expect(request.state).to.equal(1); // RequestState.Sent
      expect(request.requester).to.equal(await consumer.getAddress());
      expect(request.call).to.equal(callData);
      expect(request.bytecodeLocation).to.equal(BYTECODE_LOCATION);
      expect(request.currentStateLocation).to.equal(CURRENT_STATE_LOCATION);
      expect(request.blockNumber).to.be.greaterThan(0);
    });
  });

  describe("replyOffchainCall()", () => {
    let requestId: string;

    beforeEach(async () => {
      await (
        await consumer.requestOffchainExecution(
          "0x1234",
          BYTECODE_LOCATION,
          CURRENT_STATE_LOCATION
        )
      ).wait();
      requestId = await coordinator.nextRequest();
    });

    it("processor can reply to offchain call", async () => {
      await (
        await coordinator
          .connect(processorAccount)
          .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();
    });

    it("emits OffchainCallReplied event", async () => {
      // In HH2 it's safer to assert the blockNumber via receipt instead of guessing +1
      const tx = await coordinator
        .connect(processorAccount)
        .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA);

      const receipt = await tx.wait();
      const bn = receipt!.blockNumber;

      await expect(tx)
        .to.emit(coordinator, "OffchainCallReplied")
        .withArgs(requestId, bn, NEW_STATE_LOCATION);
    });

    it("updates request state to Completed", async () => {
      await (
        await coordinator
          .connect(processorAccount)
          .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      const state = await coordinator.getRequestState(requestId);
      expect(state).to.equal(2); // RequestState.Completed
    });

    it("stores new state location and return data", async () => {
      await (
        await coordinator
          .connect(processorAccount)
          .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      const request = await coordinator.getRequest(requestId);
      expect(request.newStateLocation).to.equal(NEW_STATE_LOCATION);
      expect(request.returnData).to.equal(RETURN_DATA);
    });

    it("triggers consumer callback", async () => {
      const tx = await coordinator
        .connect(processorAccount)
        .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA);

      await expect(tx)
        .to.emit(consumer, "ResponseReceived")
        .withArgs(requestId, NEW_STATE_LOCATION, RETURN_DATA);

      const response = await consumer.getResponse(requestId);
      expect(response.received).to.equal(true);
      expect(response.newStateLocation).to.equal(NEW_STATE_LOCATION);
      expect(response.returnData).to.equal(RETURN_DATA);
    });

    it("reverts if caller doesn't have PROCESSOR_ROLE", async () => {
      await expect(
        coordinator
          .connect(unauthorizedAccount)
          .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      )
        .to.be.revertedWithCustomError(coordinator, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorizedAccount.address, PROCESSOR_ROLE);
    });

    it("reverts if request doesn't exist", async () => {
      const fakeRequestId = zeroPadValue(toBeHex(999), 32);

      await expect(
        coordinator
          .connect(processorAccount)
          .replyOffchainCall(fakeRequestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).to.be.revertedWith("Invalid request state");
    });

    it("reverts if request is already completed", async () => {
      await (
        await coordinator
          .connect(processorAccount)
          .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      await expect(
        coordinator
          .connect(processorAccount)
          .replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).to.be.revertedWith("Invalid request state");
    });
  });

  describe("FIFO Queue Ordering", () => {
    it("enforces FIFO order - nextRequest moves after fulfillment", async () => {
      await (await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const req1 = await coordinator.nextRequest();

      await (await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      await (await consumer.requestOffchainExecution("0x03", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();

      await (
        await coordinator.connect(processorAccount).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      const req2 = await coordinator.nextRequest();
      expect(req2).to.not.equal(req1);
      expect(req2).to.not.equal(zeroPadValue("0x00", 32));
    });

    it("reverts if trying to fulfill out of order (unknown id)", async () => {
      const tx1 = await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
      await tx1.wait();
      const req1 = await coordinator.nextRequest();

      const tx2 = await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
      await tx2.wait();

      // We can't easily derive req2 without replicating the contract's requestId formula.
      // So we use a fake requestId, expecting the contract to reject it.
      const fakeReq2 = keccak256(toUtf8Bytes("some_other_request"));

      await expect(
        coordinator.connect(processorAccount).replyOffchainCall(fakeReq2, NEW_STATE_LOCATION, RETURN_DATA)
      ).to.be.revertedWith("Invalid request state");

      // sanity: req1 is still pending
      expect(await coordinator.nextRequest()).to.equal(req1);
    });

    it("nextRequest() updates after fulfillment", async () => {
      await (await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const req1 = await coordinator.nextRequest();

      await (await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();

      await (
        await coordinator.connect(processorAccount).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      const req2 = await coordinator.nextRequest();
      expect(req2).to.not.equal(req1);
    });

    it("nextRequest() returns zero when queue is empty", async () => {
      expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
    });

    it("nextRequest() returns zero after all requests fulfilled", async () => {
      await (await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const req1 = await coordinator.nextRequest();

      await (
        await coordinator.connect(processorAccount).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
    });
  });

  describe("View Functions", () => {
    let requestId: string;

    beforeEach(async () => {
      await (await consumer.requestOffchainExecution("0x1234", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      requestId = await coordinator.nextRequest();
    });

    it("getRequestState() returns correct state", async () => {
      expect(await coordinator.getRequestState(requestId)).to.equal(1); // Sent

      await (
        await coordinator.connect(processorAccount).replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      expect(await coordinator.getRequestState(requestId)).to.equal(2); // Completed
    });

    it("isPending() returns true for sent requests", async () => {
      expect(await coordinator.isPending(requestId)).to.equal(true);
    });

    it("isPending() returns false for completed requests", async () => {
      await (
        await coordinator.connect(processorAccount).replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      expect(await coordinator.isPending(requestId)).to.equal(false);
    });

    it("getRequest() returns complete request data", async () => {
      const request = await coordinator.getRequest(requestId);

      expect(request.state).to.equal(1);
      expect(request.requester).to.equal(await consumer.getAddress());
      expect(request.call).to.equal("0x1234");
      expect(request.nonce).to.be.greaterThan(0);
    });

    it("getRequestBlock() returns correct block number", async () => {
      const blockNumber = await coordinator.getRequestBlock(requestId);
      expect(blockNumber).to.be.greaterThan(0);
    });

    it("getRequestBlock() returns 0 for non-existent request", async () => {
      const fakeId = zeroPadValue(toBeHex(999), 32);
      expect(await coordinator.getRequestBlock(fakeId)).to.equal(0);
    });
  });

  describe("ExampleConsumer Integration", () => {
    it("consumer can store and retrieve responses", async () => {
      await (await consumer.requestOffchainExecution("0x1234", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const requestId = await coordinator.nextRequest();

      await (
        await coordinator.connect(processorAccount).replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      ).wait();

      const response = await consumer.getResponse(requestId);
      expect(response.received).to.equal(true);
      expect(response.newStateLocation).to.equal(NEW_STATE_LOCATION);
      expect(response.returnData).to.equal(RETURN_DATA);
      expect(response.timestamp).to.be.greaterThan(0);
    });

    it("consumer emits ResponseReceived event", async () => {
      await (await consumer.requestOffchainExecution("0x1234", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const requestId = await coordinator.nextRequest();

      await expect(
        coordinator.connect(processorAccount).replyOffchainCall(requestId, NEW_STATE_LOCATION, RETURN_DATA)
      )
        .to.emit(consumer, "ResponseReceived")
        .withArgs(requestId, NEW_STATE_LOCATION, RETURN_DATA);
    });
  });

  describe("Multiple Requests Workflow", () => {
    it("handles multiple sequential requests correctly", async () => {
      const numRequests = 5;

      // Send multiple requests
      for (let i = 0; i < numRequests; i++) {
        await (
          await consumer.requestOffchainExecution(
            toBeHex(i),
            BYTECODE_LOCATION,
            CURRENT_STATE_LOCATION
          )
        ).wait();
      }

      // Fulfill all requests in order
      for (let i = 0; i < numRequests; i++) {
        const currentReqId = await coordinator.nextRequest();
        expect(currentReqId).to.not.equal(zeroPadValue("0x00", 32));

        await (
          await coordinator.connect(processorAccount).replyOffchainCall(
            currentReqId,
            NEW_STATE_LOCATION + i,
            RETURN_DATA
          )
        ).wait();

        expect(await coordinator.getRequestState(currentReqId)).to.equal(2); // Completed
      }

      expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
    });

    it("maintains correct queue state throughout lifecycle", async () => {
      expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));

      await (await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const req1 = await coordinator.nextRequest();
      expect(req1).to.not.equal(zeroPadValue("0x00", 32));

      await (await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      expect(await coordinator.nextRequest()).to.equal(req1);

      await (await coordinator.connect(processorAccount).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA)).wait();
      const req2 = await coordinator.nextRequest();
      expect(req2).to.not.equal(req1);

      await (await coordinator.connect(processorAccount).replyOffchainCall(req2, NEW_STATE_LOCATION, RETURN_DATA)).wait();
      expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
    });
  });

  describe("Edge Cases", () => {
    it("handles empty call data", async () => {
      await (await consumer.requestOffchainExecution("0x", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
    });

    it("handles empty string locations", async () => {
      await (await consumer.requestOffchainExecution("0x1234", "", "")).wait();
    });

    it("handles long string locations", async () => {
      const longString = "ipfs://" + "Q".repeat(100);
      await (await consumer.requestOffchainExecution("0x1234", longString, longString)).wait();
    });

    it("handles large call data", async () => {
      const largeData = "0x" + "ab".repeat(1000);
      await (await consumer.requestOffchainExecution(largeData, BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
    });
  });

  describe("Access Control Edge Cases", () => {
    it("user can renounce their own role", async () => {
      await (await coordinator.connect(processorAccount).renounceRole(PROCESSOR_ROLE, processorAccount.address)).wait();
      expect(await coordinator.hasRole(PROCESSOR_ROLE, processorAccount.address)).to.equal(false);
    });

    it("admin can renounce their role", async () => {
      await (await coordinator.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
    });

    it("multiple processors can work independently", async () => {
      const processor2 = unauthorizedAccount;
      await (await coordinator.grantRole(PROCESSOR_ROLE, processor2.address)).wait();

      await (await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      const req1 = await coordinator.nextRequest();

      await (await coordinator.connect(processor2).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA)).wait();
    });

    it("multiple consumers can send requests", async () => {
      const consumer2 = await new ExampleConsumer__factory(deployer).deploy(
        await coordinator.getAddress(),
        BYTECODE_LOCATION,
        CURRENT_STATE_LOCATION
      );
      await consumer2.waitForDeployment();
      await (await coordinator.grantRole(CONSUMER_ROLE, await consumer2.getAddress())).wait();

      await (await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();
      await (await consumer2.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION)).wait();

      const req1 = await coordinator.nextRequest();
      expect(req1).to.not.equal(zeroPadValue("0x00", 32));
    });
  });
});
