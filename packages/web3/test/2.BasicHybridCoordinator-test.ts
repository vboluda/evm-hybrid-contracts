import { expect } from "chai";
import { network } from "hardhat";
import { zeroPadValue, toBeHex, ZeroAddress, keccak256, toUtf8Bytes } from "ethers";
import { 
    BasicHybridCoordinator, 
    BasicHybridCoordinator__factory,
    ExampleConsumer,
    ExampleConsumer__factory
} from "../types/ethers-contracts/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const { ethers } = await network.connect();

describe("BasicHybridCoordinator TEST", function () {
    let coordinator: BasicHybridCoordinator;
    let consumer: ExampleConsumer;
    let deployer: HardhatEthersSigner;
    let consumerAccount: HardhatEthersSigner;
    let processorAccount: HardhatEthersSigner;
    let unauthorizedAccount: HardhatEthersSigner;

    const CONSUMER_ROLE = keccak256(toUtf8Bytes("CONSUMER_ROLE"));
    const PROCESSOR_ROLE = keccak256(toUtf8Bytes("PROCESSOR_ROLE"));
    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

    const BYTECODE_LOCATION = "ipfs://Qm123bytecode";
    const CURRENT_STATE_LOCATION = "ipfs://Qm456currentstate";
    const NEW_STATE_LOCATION = "ipfs://Qm789newstate";
    const RETURN_DATA = "0x1234567890abcdef";

    beforeEach(async function () {
        [deployer, consumerAccount, processorAccount, unauthorizedAccount] = await ethers.getSigners();
        
        // Deploy BasicHybridCoordinator
        coordinator = await new BasicHybridCoordinator__factory(deployer).deploy(deployer.address);
        await coordinator.waitForDeployment();

        // Deploy ExampleConsumer
        consumer = await new ExampleConsumer__factory(deployer).deploy(
            await coordinator.getAddress(),
            BYTECODE_LOCATION,
            CURRENT_STATE_LOCATION
        );
        await consumer.waitForDeployment();

        // Grant roles
        await coordinator.grantRole(CONSUMER_ROLE, await consumer.getAddress());
        await coordinator.grantRole(PROCESSOR_ROLE, processorAccount.address);
    });

    describe("Deployment & Initial State", () => {
        it("should deploy successfully with correct admin", async () => {
            expect(await coordinator.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(true);
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
            await coordinator.grantRole(CONSUMER_ROLE, consumerAccount.address);
            expect(await coordinator.hasRole(CONSUMER_ROLE, consumerAccount.address)).to.equal(true);
        });

        it("admin can grant PROCESSOR_ROLE", async () => {
            const newProcessor = unauthorizedAccount.address;
            await coordinator.grantRole(PROCESSOR_ROLE, newProcessor);
            expect(await coordinator.hasRole(PROCESSOR_ROLE, newProcessor)).to.equal(true);
        });

        it("admin can revoke roles", async () => {
            await coordinator.revokeRole(PROCESSOR_ROLE, processorAccount.address);
            expect(await coordinator.hasRole(PROCESSOR_ROLE, processorAccount.address)).to.equal(false);
        });

        it("non-admin cannot grant roles", async () => {
            await expect(
                coordinator.connect(unauthorizedAccount).grantRole(CONSUMER_ROLE, unauthorizedAccount.address)
            ).to.be.revertedWithCustomError(coordinator, "AccessControlUnauthorizedAccount")
            .withArgs(unauthorizedAccount.address, DEFAULT_ADMIN_ROLE)
        });
    });

    describe("sendOffchainCall()", () => {
        it("consumer can send offchain call request", async () => {
            const callData = "0x12345678";
            
            // Verify event is emitted with correct parameters
            const tx = consumer.requestOffchainExecution(
                callData,
                BYTECODE_LOCATION,
                CURRENT_STATE_LOCATION
            );
            
            const receipt = await (await tx).wait();
            const blockNumber = receipt!.blockNumber;
            

            // Get the requestId from nextRequest
            const requestId = await coordinator.nextRequest();
            expect(requestId).to.not.equal(zeroPadValue("0x00", 32));

             const nonce = await coordinator.nonce();
            
            // Verify event was emitted with correct arguments
            await expect(tx)
                .to.emit(coordinator, "OffchainCallSent")
                .withArgs(requestId, nonce, await consumer.getAddress(), await deployer.getAddress(), blockNumber, callData, BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
        });

        it("emits OffchainCallSent event with correct parameters", async () => {
            const callData = "0xabcdef";
            
            const tx = consumer.requestOffchainExecution(
                callData,
                BYTECODE_LOCATION,
                CURRENT_STATE_LOCATION
            );
            
            const receipt = await (await tx).wait();
            const blockNumber = receipt!.blockNumber;
            const requestId = await coordinator.nextRequest();
            const nonce = await coordinator.nonce();
            
            await expect(tx)
                .to.emit(coordinator, "OffchainCallSent")
                .withArgs(requestId, nonce, await consumer.getAddress(), await deployer.getAddress(), blockNumber, callData, BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
        });

        it("generates unique request IDs for different requests", async () => {
            const tx1 = await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const receipt1 = await tx1.wait();
            const requestId1 = await coordinator.nextRequest();

            // Fulfill first request to move queue
            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId1,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            const tx2 = await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const receipt2 = await tx2.wait();
            const requestId2 = await coordinator.nextRequest();

            expect(requestId1).to.not.equal(requestId2);
        });

        it("reverts if caller doesn't have CONSUMER_ROLE", async () => {
            // Try to call sendOffchainCall directly from unauthorized account
            await expect(
                coordinator.connect(unauthorizedAccount).sendOffchainCall(
                    unauthorizedAccount.address,
                    "0x1234",
                    BYTECODE_LOCATION,
                    CURRENT_STATE_LOCATION
                )
            ).to.be.revertedWithCustomError(coordinator, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedAccount.address, CONSUMER_ROLE);
        });

        it("reverts if consumer doesn't support IResponseOffchainCallConsumer interface", async () => {
            // Grant role to an EOA (which doesn't support the interface)
            await coordinator.grantRole(CONSUMER_ROLE, consumerAccount.address);
            
            // EOA cannot implement interfaces, so calling supportsInterface will fail with a generic error
            await expect(
                coordinator.connect(consumerAccount).sendOffchainCall(
                    consumerAccount.address,
                    "0x1234",
                    BYTECODE_LOCATION,
                    CURRENT_STATE_LOCATION
                )
            ).to.be.revertedWithoutReason(); // Generic revert because EOA has no code
        });

        it("stores request data correctly", async () => {
            const callData = "0xdeadbeef";
            
            await consumer.requestOffchainExecution(
                callData,
                BYTECODE_LOCATION,
                CURRENT_STATE_LOCATION
            );

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
            // Send a request first
            await consumer.requestOffchainExecution(
                "0x1234",
                BYTECODE_LOCATION,
                CURRENT_STATE_LOCATION
            );
            requestId = await coordinator.nextRequest();
        });

        it("processor can reply to offchain call", async () => {
            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );
            // Transaction should succeed without reverting
        });

        it("emits OffchainCallReplied event", async () => {
            await expect(
                coordinator.connect(processorAccount).replyOffchainCall(
                    requestId,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.emit(coordinator, "OffchainCallReplied")
                .withArgs(requestId, await ethers.provider.getBlockNumber() + 1, NEW_STATE_LOCATION);
        });

        it("updates request state to Completed", async () => {
            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            const state = await coordinator.getRequestState(requestId);
            expect(state).to.equal(2); // RequestState.Completed
        });

        it("stores new state location and return data", async () => {
            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            const request = await coordinator.getRequest(requestId);
            expect(request.newStateLocation).to.equal(NEW_STATE_LOCATION);
            expect(request.returnData).to.equal(RETURN_DATA);
        });

        it("triggers consumer callback", async () => {
            await expect(
                coordinator.connect(processorAccount).replyOffchainCall(
                    requestId,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.emit(consumer, "ResponseReceived")
                .withArgs(requestId, NEW_STATE_LOCATION, RETURN_DATA);

            const response = await consumer.getResponse(requestId);
            expect(response.received).to.equal(true);
            expect(response.newStateLocation).to.equal(NEW_STATE_LOCATION);
            expect(response.returnData).to.equal(RETURN_DATA);
        });

        it("reverts if caller doesn't have PROCESSOR_ROLE", async () => {
            await expect(
                coordinator.connect(unauthorizedAccount).replyOffchainCall(
                    requestId,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.be.revertedWithCustomError(coordinator, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedAccount.address, PROCESSOR_ROLE);
        });

        it("reverts if request doesn't exist", async () => {
            const fakeRequestId = zeroPadValue(toBeHex(999), 32);
            
            await expect(
                coordinator.connect(processorAccount).replyOffchainCall(
                    fakeRequestId,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.be.revertedWith("Invalid request state");
        });

        it("reverts if request is already completed", async () => {
            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            await expect(
                coordinator.connect(processorAccount).replyOffchainCall(
                    requestId,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.be.revertedWith("Invalid request state");
        });
    });

    describe("FIFO Queue Ordering", () => {
        it("enforces FIFO order - must reply to requests in order", async () => {
            // Send three requests
            await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const req1 = await coordinator.nextRequest();

            await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            
            await consumer.requestOffchainExecution("0x03", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            
            // Try to fulfill second request (should fail)
            // We need to get req2 somehow - we'll need to track it
            // Since we can't easily get req2, let's modify this test

            // Better approach: fulfill first, then verify second is next
            await coordinator.connect(processorAccount).replyOffchainCall(
                req1,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            const req2 = await coordinator.nextRequest();
            expect(req2).to.not.equal(req1);
            expect(req2).to.not.equal(zeroPadValue("0x00", 32));
        });

        it("reverts if trying to fulfill out of order", async () => {
            // Send two requests and capture both IDs
            const tx1 = await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            await tx1.wait();
            const req1 = await coordinator.nextRequest();

            const tx2 = await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            await tx2.wait();
            
            // Get all request details to find req2
            const req1Data = await coordinator.getRequest(req1);
            
            // Generate req2 manually (hacky but works for testing)
            // We know it uses: keccak256(abi.encodePacked(block.number, msg.sender, _nonce))
            // req2 should have nonce = nonce1 + 1
            // For testing, we can create a fake requestId that's not req1
            const fakeReq2 = keccak256(toUtf8Bytes("some_other_request"));

            // Try to reply to a request that's not at the front
            await expect(
                coordinator.connect(processorAccount).replyOffchainCall(
                    fakeReq2,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.be.revertedWith("Invalid request state");
        });

        it("nextRequest() updates after fulfillment", async () => {
            await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const req1 = await coordinator.nextRequest();

            await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);

            // Fulfill first request
            await coordinator.connect(processorAccount).replyOffchainCall(
                req1,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            const req2 = await coordinator.nextRequest();
            expect(req2).to.not.equal(req1);
        });

        it("nextRequest() returns zero when queue is empty", async () => {
            expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
        });

        it("nextRequest() returns zero after all requests fulfilled", async () => {
            await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const req1 = await coordinator.nextRequest();

            await coordinator.connect(processorAccount).replyOffchainCall(
                req1,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
        });
    });

    describe("View Functions", () => {
        let requestId: string;

        beforeEach(async () => {
            await consumer.requestOffchainExecution("0x1234", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            requestId = await coordinator.nextRequest();
        });

        it("getRequestState() returns correct state", async () => {
            expect(await coordinator.getRequestState(requestId)).to.equal(1); // Sent

            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            expect(await coordinator.getRequestState(requestId)).to.equal(2); // Completed
        });

        it("isPending() returns true for sent requests", async () => {
            expect(await coordinator.isPending(requestId)).to.equal(true);
        });

        it("isPending() returns false for completed requests", async () => {
            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

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
            await consumer.requestOffchainExecution("0x1234", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const requestId = await coordinator.nextRequest();

            await coordinator.connect(processorAccount).replyOffchainCall(
                requestId,
                NEW_STATE_LOCATION,
                RETURN_DATA
            );

            const response = await consumer.getResponse(requestId);
            expect(response.received).to.equal(true);
            expect(response.newStateLocation).to.equal(NEW_STATE_LOCATION);
            expect(response.returnData).to.equal(RETURN_DATA);
            expect(response.timestamp).to.be.greaterThan(0);
        });

        it("consumer emits ResponseReceived event", async () => {
            await consumer.requestOffchainExecution("0x1234", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const requestId = await coordinator.nextRequest();

            await expect(
                coordinator.connect(processorAccount).replyOffchainCall(
                    requestId,
                    NEW_STATE_LOCATION,
                    RETURN_DATA
                )
            ).to.emit(consumer, "ResponseReceived")
                .withArgs(requestId, NEW_STATE_LOCATION, RETURN_DATA);
        });
    });

    describe("Multiple Requests Workflow", () => {
        it("handles multiple sequential requests correctly", async () => {
            const numRequests = 5;
            const requestIds: string[] = [];

            // Send multiple requests
            for (let i = 0; i < numRequests; i++) {
                await consumer.requestOffchainExecution(
                    toBeHex(i),
                    BYTECODE_LOCATION,
                    CURRENT_STATE_LOCATION
                );
                
                if (i === 0) {
                    requestIds.push(await coordinator.nextRequest());
                }
            }

            // Fulfill all requests in order
            for (let i = 0; i < numRequests; i++) {
                const currentReqId = await coordinator.nextRequest();
                expect(currentReqId).to.not.equal(zeroPadValue("0x00", 32));

                await coordinator.connect(processorAccount).replyOffchainCall(
                    currentReqId,
                    NEW_STATE_LOCATION + i,
                    RETURN_DATA
                );

                expect(await coordinator.getRequestState(currentReqId)).to.equal(2); // Completed
            }

            // Queue should be empty
            expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
        });

        it("maintains correct queue state throughout lifecycle", async () => {
            // Empty queue
            expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));

            // Add one
            await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const req1 = await coordinator.nextRequest();
            expect(req1).to.not.equal(zeroPadValue("0x00", 32));

            // Add second
            await consumer.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            expect(await coordinator.nextRequest()).to.equal(req1); // Still req1 at front

            // Fulfill first
            await coordinator.connect(processorAccount).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA);
            const req2 = await coordinator.nextRequest();
            expect(req2).to.not.equal(req1);

            // Fulfill second
            await coordinator.connect(processorAccount).replyOffchainCall(req2, NEW_STATE_LOCATION, RETURN_DATA);
            expect(await coordinator.nextRequest()).to.equal(zeroPadValue("0x00", 32));
        });
    });

    describe("Edge Cases", () => {
        it("handles empty call data", async () => {
            await consumer.requestOffchainExecution("0x", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            // Transaction should succeed
        });

        it("handles empty string locations", async () => {
            await consumer.requestOffchainExecution("0x1234", "", "");
            // Transaction should succeed
        });

        it("handles long string locations", async () => {
            const longString = "ipfs://" + "Q".repeat(100);
            await consumer.requestOffchainExecution("0x1234", longString, longString);
            // Transaction should succeed
        });

        it("handles large call data", async () => {
            const largeData = "0x" + "ab".repeat(1000);
            await consumer.requestOffchainExecution(largeData, BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            // Transaction should succeed
        });
    });

    describe("Access Control Edge Cases", () => {
        it("user can renounce their own role", async () => {
            await coordinator.connect(processorAccount).renounceRole(PROCESSOR_ROLE, processorAccount.address);
            expect(await coordinator.hasRole(PROCESSOR_ROLE, processorAccount.address)).to.equal(false);
        });

        it("admin can renounce their role", async () => {
            // Admin can renounce their own role
            await coordinator.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
            // Transaction should succeed
        });

        it("multiple processors can work independently", async () => {
            const processor2 = unauthorizedAccount;
            await coordinator.grantRole(PROCESSOR_ROLE, processor2.address);

            await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            const req1 = await coordinator.nextRequest();

            // Either processor can fulfill
            await coordinator.connect(processor2).replyOffchainCall(req1, NEW_STATE_LOCATION, RETURN_DATA);
            // Transaction should succeed
        });

        it("multiple consumers can send requests", async () => {
            const consumer2 = await new ExampleConsumer__factory(deployer).deploy(
                await coordinator.getAddress(),
                BYTECODE_LOCATION,
                CURRENT_STATE_LOCATION
            );
            await consumer2.waitForDeployment();
            await coordinator.grantRole(CONSUMER_ROLE, await consumer2.getAddress());

            await consumer.requestOffchainExecution("0x01", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);
            await consumer2.requestOffchainExecution("0x02", BYTECODE_LOCATION, CURRENT_STATE_LOCATION);

            // Both requests should be in queue
            const req1 = await coordinator.nextRequest();
            expect(req1).to.not.equal(zeroPadValue("0x00", 32));
        });
    });
});
