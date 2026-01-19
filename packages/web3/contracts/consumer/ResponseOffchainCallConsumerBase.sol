// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "../interfaces/IBasicHybridCoordinator.sol";
import "../interfaces/IResponseOffchainCallConsumer.sol";

/**
 * @title ResponseOffchainCallConsumerBase
 * @notice Abstract base contract that implements EIP-165 support for IResponseOffchainCallConsumer
 * @dev Inherit from this contract to automatically support interface detection
 */
abstract contract ResponseOffchainCallConsumerBase is IResponseOffchainCallConsumer {
    
    /// @notice Error thrown when an unauthorized address attempts to call onOffchainCallResponse
    /// @param caller The address that attempted the unauthorized call
    error UnauthorizedCaller(address caller);

    /// @notice Address of the coordinator contract authorized to send responses
    address public coordinatorAddress;

    /// @notice IPFS location or URI reference to the contract bytecode for off-chain execution
    string public bytecodeLocation;
    
    /// @notice IPFS location or URI reference to the current state of the contract
    /// @dev This is updated after each successful off-chain call response
    string public currentStateLocation;

    /**
     * @notice Initializes the consumer with the coordinator address
     * @dev Sets the coordinator address that is authorized to call onOffchainCallResponse
     * @param _coordinatorAddress Address of the BasicHybridCoordinator contract
     */
    constructor(address _coordinatorAddress, string memory _bytecodeLocation, string memory _currentStateLocation) {
        coordinatorAddress = _coordinatorAddress;
        bytecodeLocation = _bytecodeLocation;
        currentStateLocation = _currentStateLocation;
    }

    /**
     * @notice Implements EIP-165 interface detection
     * @param interfaceId The interface identifier to check
     * @return bool True if the contract implements the interface
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IResponseOffchainCallConsumer).interfaceId ||
               interfaceId == type(IERC165).interfaceId;
    }
    
    /**
     * @notice Must be implemented by derived contracts to handle off-chain call responses
     * @param requestId The unique identifier of the original off-chain call request
     * @param newStateLocation The location of the new state (typically IPFS CID)
     * @param returnData The return value from the executed off-chain contract call
     */
    function onOffchainCallResponse(
        bytes32 requestId,
        string calldata newStateLocation,
        string calldata returnData
    ) external virtual override{
        if (msg.sender != coordinatorAddress) {
            revert UnauthorizedCaller(msg.sender);
        }
        emit OffchainCallResponseReceived(requestId, newStateLocation, returnData);
        currentStateLocation = newStateLocation;
        receiveResponse(requestId, newStateLocation, returnData);
    }

    /**
     * @notice Internal function to be implemented by derived contracts for custom response handling
     * @dev This function is called after authorization checks and event emission
     *      Implement your custom business logic here to process the off-chain execution results
     * @param requestId The unique identifier of the original off-chain call request
     * @param newStateLocation The location of the new state after execution (typically IPFS CID)
     * @param returnData The return value from the executed off-chain contract call
     */
    function receiveResponse(
        bytes32 requestId,
        string calldata newStateLocation,
        string calldata returnData
    ) internal virtual;

    /**
     * @notice Sends an off-chain execution request through the coordinator
     * @dev This contract must have CONSUMER_ROLE in the coordinator to successfully send requests
     *      Uses the stored bytecodeLocation and currentStateLocation for the request
     * @param call The encoded function call to execute off-chain
     * @return requestId Unique identifier for tracking this request
     */
    function sendOffchainRequest(
        bytes calldata call
    ) internal virtual returns (bytes32 requestId){
        IBasicHybridCoordinator coordinator = IBasicHybridCoordinator(coordinatorAddress);
        requestId = coordinator.sendOffchainCall(
            call,
            bytecodeLocation,
            currentStateLocation);
    }
}
