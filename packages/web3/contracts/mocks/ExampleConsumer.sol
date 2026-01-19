// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "../consumer/ResponseOffchainCallConsumerBase.sol";
import "../interfaces/IBasicHybridCoordinator.sol";

/**
 * @title ExampleConsumer
 * @notice Example contract that demonstrates how to implement IResponseOffchainCallConsumer
 * @dev Inherits from ResponseOffchainCallConsumerBase to automatically support EIP-165
 */
contract ExampleConsumer is ResponseOffchainCallConsumerBase {
    
    /// @notice Reference to the BasicHybridCoordinator contract
    IBasicHybridCoordinator public coordinator;
    
    /// @notice Mapping to store responses by request ID
    mapping(bytes32 => ResponseData) public responses;
    
    /// @notice Struct to store response data
    struct ResponseData {
        string newStateLocation;
        string returnData;
        uint256 timestamp;
        bool received;
    }
    
    event ResponseReceived(bytes32 indexed requestId, string newStateLocation, string returnData);
    
    /**
     * @notice Constructor to set the coordinator address
     * @param _coordinator Address of the BasicHybridCoordinator contract
     * @param _bytecodeLocation IPFS location of the bytecode
     * @param _currentStateLocation IPFS location of the current state
     */
    constructor(
        address _coordinator,
        string memory _bytecodeLocation,
        string memory _currentStateLocation
    ) ResponseOffchainCallConsumerBase(_coordinator, _bytecodeLocation, _currentStateLocation) {
        coordinator = IBasicHybridCoordinator(_coordinator);
    }
    
    /**
     * @notice Sends an off-chain call request through the coordinator
     * @param call The encoded function call to execute
     * @param bytecodeLocation IPFS location of the bytecode
     * @param currentStateLocation IPFS location of the current state
     * @return requestId The unique identifier for this request
     */
    function requestOffchainExecution(
        bytes calldata call,
        string calldata bytecodeLocation,
        string calldata currentStateLocation
    ) external returns (bytes32 requestId) {
        requestId = coordinator.sendOffchainCall(
            call,
            bytecodeLocation,
            currentStateLocation
        );
        return requestId;
    }
    
    /**
     * @notice Internal function that handles responses from off-chain execution
     * @dev This function is called by the base contract after validation
     * @param requestId The unique identifier of the original request
     * @param newStateLocation The location of the new state after execution
     * @param returnData The return value from the executed contract call
     */
    function receiveResponse(
        bytes32 requestId,
        string calldata newStateLocation,
        string calldata returnData
    ) internal override {
        // Store the response
        responses[requestId] = ResponseData({
            newStateLocation: newStateLocation,
            returnData: returnData,
            timestamp: block.timestamp,
            received: true
        });
        
        emit ResponseReceived(requestId, newStateLocation, returnData);
        
        // Add your custom logic here to process the response
        // For example, decode returnData and update contract state
    }
    
    /**
     * @notice Gets the response data for a given request ID
     * @param requestId The request ID to query
     * @return ResponseData The stored response data
     */
    function getResponse(bytes32 requestId) external view returns (ResponseData memory) {
        return responses[requestId];
    }
}
