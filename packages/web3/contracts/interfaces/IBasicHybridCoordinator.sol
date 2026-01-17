// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title IBasicHybridCoordinator
 * @author Vicente Boluda Vias
 * @notice Interface for coordinating hybrid on-chain/off-chain contract execution
 * @dev This interface enables contracts to delegate execution to an off-chain backend,
 *      allowing for complex computations while maintaining state consistency
 */
interface IBasicHybridCoordinator {

    /**
     * @notice Emitted when an off-chain call request is sent
     * @param requestId Unique identifier (nonce) for this request
     * @param block Block number at which the request was sent
     * @param call The encoded contract call to be executed (e.g., transfer(addr1, 1000) in bytecode)
     * @param bytecodeLocation Reference to the bytecode of the contract on which the call will be executed
     * @param currentStateLocation Reference to the current state of the contract before execution
     */
    event OffchainCallSent(bytes32 indexed requestId, uint256 block, bytes call, string bytecodeLocation, string currentStateLocation);
    
    /**
     * @notice Emitted when the off-chain execution is complete and the response is received
     * @param requestId Unique identifier matching the original request
     * @param block Block number at which the reply was received
     * @param newStateLocation Reference to the updated state of the contract after execution
     */
    event OffchainCallReplied(bytes32 indexed requestId, uint256 block, bytes newStateLocation);
    
    /**
     * @notice Initiates an off-chain contract execution request
     * @dev Generates a unique nonce (requestId) and emits OffchainCallSent event.
     *      The backend monitors this event and processes the request off-chain.
     * @param call The encoded function call to execute on the external contract (bytecode format)
     *        Example: transfer(address recipient, uint256 amount) encoded as bytes
     * @param bytecodeLocation IPFS hash or URI reference to the bytecode of the contract to be executed
     * @param currentStateLocation IPFS hash or URI reference to the current state snapshot of the contract
     * @return requestId Unique identifier for tracking this request through its lifecycle
     */
    function sendOffchainCall(bytes calldata call, string calldata bytecodeLocation, string calldata currentStateLocation) external returns (bytes32 requestId);

    /**
     * @notice Callback function invoked by the backend server after completing off-chain execution
     * @dev This function should only be called by authorized backend servers.
     *      Emits OffchainCallReplied event upon successful completion.
     * @param requestId The unique identifier of the request being responded to
     * @param newStateLocation IPFS hash or URI reference to the new state snapshot after execution
     * @param returnData The return value from the executed contract call (encoded bytes)
     */
    function replyOffchainCall(bytes32 requestId, bytes calldata newStateLocation, bytes calldata returnData) external;
}