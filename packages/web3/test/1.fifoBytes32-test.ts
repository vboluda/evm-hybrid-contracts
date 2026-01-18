import { expect } from "chai";
import { network } from "hardhat";

import { zeroPadValue, toBeHex } from "ethers";
import { FIFOBytes32Harness, FIFOBytes32Harness__factory } from "../types/ethers-contracts/index.js";

const { ethers } = await network.connect();

const LONG_DETERMINISTIC_ITERATIONS = 400;

function b32(i: number): string {
    return zeroPadValue(toBeHex(i), 32);
}

describe("FIFOBytes32 TEST", function () {
    let h: FIFOBytes32Harness;

    beforeEach(async function () {
        const [deployer] = await ethers.getSigners();
        h = await new FIFOBytes32Harness__factory(deployer).deploy();
        await h.waitForDeployment();
    });

    it("dequeue() on empty reverts with QueueEmpty()", async () => {
        await expect(h.dequeue()).to.be.revertedWithCustomError(h, "QueueEmpty");
    });

    it("peek() on empty reverts with QueueEmpty()", async () => {
        await expect(h.peek()).to.be.revertedWithCustomError(h, "QueueEmpty");
    });

    it("enqueue then peek returns the enqueued value", async () => {
        const x = b32(1);
        await h.enqueue(x);
        expect(await h.peek()).to.equal(x);
    });

    it("enqueue then dequeue returns the enqueued value", async () => {
        const x = b32(42);
        await h.enqueue(x);

        // As it is not a view function, we use staticCall to simulate the call without state change
        const out = await h.dequeue.staticCall();
        expect(out).to.equal(x);
        await h.dequeue(); // actually dequeue
        expect(await h.isEmpty()).to.equal(true);
        expect(await h.length()).to.equal(0n);
    });

    it("FIFO order is preserved", async () => {
        const a = b32(1);
        const b = b32(2);
        const c = b32(3);

        await (await h.enqueue(a)).wait();
        await (await h.enqueue(b)).wait();
        await (await h.enqueue(c)).wait();

        // a
        expect(await h.dequeue.staticCall()).to.equal(a);
        await (await h.dequeue()).wait();

        // now front must be b
        expect(await h.peek()).to.equal(b);

        // b
        expect(await h.dequeue.staticCall()).to.equal(b);
        await (await h.dequeue()).wait();

        // c
        expect(await h.dequeue.staticCall()).to.equal(c);
        await (await h.dequeue()).wait();

        expect(await h.isEmpty()).to.equal(true);
    });

    it("length/isEmpty/indices behave consistently", async () => {
        expect(await h.isEmpty()).to.equal(true);
        expect(await h.length()).to.equal(0n);

        let [head, tail] = await h.indices();
        expect(head).to.equal(0n);
        expect(tail).to.equal(0n);

        await h.enqueue(b32(10));
        await h.enqueue(b32(11));
        await h.enqueue(b32(12));

        expect(await h.isEmpty()).to.equal(false);
        expect(await h.length()).to.equal(3n);

        [head, tail] = await h.indices();
        expect(tail - head).to.equal(3n);

        await h.dequeue();
        await h.dequeue();

        expect(await h.length()).to.equal(1n);
        [head, tail] = await h.indices();
        expect(tail - head).to.equal(1n);

        await h.dequeue();
        expect(await h.isEmpty()).to.equal(true);

        [head, tail] = await h.indices();
        expect(head).to.equal(tail);
        expect(await h.length()).to.equal(0n);
    });

    it("dequeue() auto-resets indices when queue becomes empty", async () => {
        await h.enqueue(b32(1));
        await h.enqueue(b32(2));
        await h.dequeue();
        
        // After one dequeue, indices should not be reset yet
        let [head, tail] = await h.indices();
        expect(head).to.equal(1n);
        expect(tail).to.equal(2n);

        // After second dequeue that empties the queue, indices should auto-reset to (0, 0)
        await h.dequeue();
        [head, tail] = await h.indices();
        expect(head).to.equal(0n);
        expect(tail).to.equal(0n);

        // Enqueue after auto-reset should start from 0
        await h.enqueue(b32(7));
        const [head2, tail2] = await h.indices();
        expect(head2).to.equal(0n);
        expect(tail2).to.equal(1n);
    });

    it("resetIfEmpty() still works independently when needed", async () => {
        await h.enqueue(b32(1));
        await h.dequeue();
        
        // Indices are already (0, 0) due to auto-reset
        let [head, tail] = await h.indices();
        expect(head).to.equal(0n);
        expect(tail).to.equal(0n);

        // resetIfEmpty should be idempotent
        await h.resetIfEmpty();
        [head, tail] = await h.indices();
        expect(head).to.equal(0n);
        expect(tail).to.equal(0n);

        // When queue is not empty, resetIfEmpty should do nothing
        await h.enqueue(b32(5));
        await h.resetIfEmpty();
        const [head2, tail2] = await h.indices();
        expect(head2).to.equal(0n);
        expect(tail2).to.equal(1n);
    });

    it(`long deterministic sequence matches a JS reference model [${LONG_DETERMINISTIC_ITERATIONS} iterations]`, async () => {
         this.timeout(120_000); // 2 minutes for time out as this test could be long
        
        const model: string[] = [];


        for (let i = 1; i <= LONG_DETERMINISTIC_ITERATIONS; i++) {
            const v = b32(i);
            await (await h.enqueue(v)).wait();
            model.push(v);

            if (i % 3 === 0 && model.length > 0) {
                const expected = model.shift()!;
                expect(await h.dequeue.staticCall()).to.equal(expected);
                await (await h.dequeue()).wait();
            }

            if (i % 5 === 0 && model.length > 0) {
                const expected = model.shift()!;
                expect(await h.dequeue.staticCall()).to.equal(expected);
                await (await h.dequeue()).wait();
            }

            const len = await h.length();
            expect(len).to.equal(BigInt(model.length));

            const empty = await h.isEmpty();
            expect(empty).to.equal(model.length === 0);

            const [head, tail] = await h.indices();
            expect(tail >= head).to.equal(true);
            expect(tail - head).to.equal(len);

            if (model.length > 0) {
                expect(await h.peek()).to.equal(model[0]);
            } else {
                await expect(h.peek()).to.be.revertedWithCustomError(h, "QueueEmpty");
            }
        }

        // Drain remaining
        while (model.length > 0) {
            const expected = model.shift()!;
            expect(await h.dequeue.staticCall()).to.equal(expected);
            await (await h.dequeue()).wait();
        }

        expect(await h.isEmpty()).to.equal(true);
        expect(await h.length()).to.equal(0n);
    });
});
