// SPDX-License-Identifier: UNLICESED
pragma solidity ^0.8.20;

import {FIFOBytes32} from "../queue/Queue.sol";

contract FIFOBytes32Harness {
    using FIFOBytes32 for FIFOBytes32.Queue;

    FIFOBytes32.Queue private q;

    function enqueue(bytes32 v) external { q.enqueue(v); }
    function dequeue() external returns (bytes32) { return q.dequeue(); }
    function peek() external view returns (bytes32) { return q.peek(); }
    function isEmpty() external view returns (bool) { return q.isEmpty(); }
    function length() external view returns (uint256) { return q.length(); }
    function indices() external view returns (uint256 head, uint256 tail) { return q.indices(); }
    function resetIfEmpty() external { q.resetIfEmpty(); }
}
