// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title IResponseOffchainCallConsumer
 * @author Vicente Boluda Vias
 * @notice Interface for contracts that consume off-chain call responses
 * @dev Contracts implementing this interface can handle responses from off-chain executions
 * This interface supports EIP-165 for interface detection
 */

interface IResponseOffchainCallConsumer is IERC165 {

    event OffchainCallResponseReceived(bytes32 indexed requestId, string newStateLocation, string returnData);
    /**
     * @notice Callback function invoked when an off-chain call response is received
     * @dev Implementers should define how to handle the response data
     * @param requestId The unique identifier of the original off-chain call request
     * @param returnData The return value from the executed off-chain contract call (encoded bytes)
     */
    function onOffchainCallResponse(bytes32 requestId, string calldata newStateLocation,string calldata returnData) external;
}