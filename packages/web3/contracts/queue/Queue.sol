// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @title FIFOBytes32
/// @author Vicente Boluda Vias
/// @notice Gas-efficient FIFO queue for bytes32 values.
/// @dev
///  - Uses mapping + head/tail indices
///  - Does NOT delete storage slots on dequeue (lowest gas cost)
///  - Storage grows over time
///  - Suitable for high-throughput queues
library FIFOBytes32 {

    /// @notice Thrown when attempting to dequeue or peek an empty queue.
    error QueueEmpty();

    /// @notice FIFO queue structure.
    struct Queue {
        /// @notice Storage for queued elements (index → value).
        mapping(uint256 => bytes32) data;
        /// @notice Index of the next element to be dequeued.
        uint256 head;
        /// @notice Index where the next element will be enqueued.
        uint256 tail;
    }

    /// @notice Adds a value to the end of the queue.
    /// @param q The queue storage reference.
    /// @param value The bytes32 value to enqueue.
    function enqueue(Queue storage q, bytes32 value) internal {
        q.data[q.tail] = value;
        unchecked { q.tail++; }
    }

    /// @notice Removes and returns the first value in FIFO order.
    /// @param q The queue storage reference.
    /// @return value The dequeued bytes32 value.
    function dequeue(Queue storage q) internal returns (bytes32 value) {
        uint256 h = q.head;
        if (h == q.tail) revert QueueEmpty();
        value = q.data[h];
        unchecked { q.head = h + 1; }
    }

    /// @notice Returns the first value in the queue without removing it.
    /// @param q The queue storage reference.
    /// @return value The first bytes32 value in the queue.
    function peek(Queue storage q) internal view returns (bytes32 value) {
        uint256 h = q.head;
        if (h == q.tail) revert QueueEmpty();
        return q.data[h];
    }

    /// @notice Checks whether the queue is empty.
    /// @param q The queue storage reference.
    /// @return empty True if the queue contains no elements.
    function isEmpty(Queue storage q) internal view returns (bool empty) {
        return q.head == q.tail;
    }

    /// @notice Returns the number of elements currently stored in the queue.
    /// @param q The queue storage reference.
    /// @return _length The number of queued elements.
    function length(Queue storage q) internal view returns (uint256 _length) {
        return q.tail - q.head;
    }

    /// @notice Returns the current head and tail indices.
    /// @param q The queue storage reference.
    /// @return head The current dequeue index.
    /// @return tail The next enqueue index.
    function indices(Queue storage q)
        internal
        view
        returns (uint256 head, uint256 tail)
    {
        return (q.head, q.tail);
    }

    /// @notice Resets head and tail indices if the queue is empty.
    /// @dev
    ///  - Does NOT delete storage slots
    ///  - Allows index reuse
    ///  - Optional safety mechanism against unbounded index growth
    /// @param q The queue storage reference.
    function resetIfEmpty(Queue storage q) internal {
        if (q.head == q.tail) {
            q.head = 0;
            q.tail = 0;
        }
    }
}
