// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/IBasicHybridCoordinator.sol";
import "./interfaces/IResponseOffchainCallConsumer.sol";
import {FIFOBytes32} from "./queue/Queue.sol";

/**
 * @title BasicHybridCoordinator
 * @author Vicente Boluda Vias
 * @notice Coordinates hybrid on-chain/off-chain contract execution with RBAC management
 * @dev Implements IBasicHybridCoordinator interface
 *      Uses OpenZeppelin's AccessControl for role-based access control
 *      Role-based access control with 3 roles: DEFAULT_ADMIN_ROLE, CONSUMER_ROLE, PROCESSOR_ROLE
 *      KNOWN LIMITATION: Requests are processed sequentially in the order they are sent.
 *                        Future versions may implement parallel processing with dependency tracking. 
 */
contract BasicHybridCoordinator is AccessControl, IBasicHybridCoordinator {

    using FIFOBytes32 for FIFOBytes32.Queue;
    FIFOBytes32.Queue private globalQueue;

    error errorFulfillingOutOfOrder(bytes32 requestId);
    error ConsumerDoesNotSupportInterface(address consumer);
    
    // =============================================================================
    // Role Definitions
    // =============================================================================
    
    /// @notice Role identifier for consumers who can send off-chain call requests
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");
    
    /// @notice Role identifier for processors who can reply to off-chain call requests
    bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");

    // =============================================================================
    // State Variables
    // =============================================================================
    
    /// @notice Counter for generating unique request IDs (nonces)
    uint256 public _nonce;
    
    /// @notice Enum representing the lifecycle states of an off-chain request
    enum RequestState {
        None,       // Request does not exist (default state)
        Sent,       // Request has been sent to the backend and is waiting for response
        Completed   // Request has been completed and backend returned the response
    }
    
    /// @notice Struct to store request data and metadata
    struct Request {
        RequestState state;           // Current state of the request
        uint256 blockNumber;          // Block number when request was created
        address requester;            // Address that initiated the request
        uint256 nonce;                // Nonce used to generate this request (for ordering)
        bytes call;                   // The original call data
        string bytecodeLocation;      // IPFS location of the bytecode
        string currentStateLocation;  // IPFS location of the current state
        string newStateLocation;       // IPFS location of the new state (after completion)
        string returnData;             // Return data from the execution
    }
    
    /// @notice Mapping to store all requests by their ID
    /// @dev Maps requestId to the Request struct containing all request data
    mapping(bytes32 => Request) public requests;
    
    // Note: Using OpenZeppelin's AccessControl modifiers:
    // - onlyRole(DEFAULT_ADMIN_ROLE) for admin functions
    // - onlyRole(CONSUMER_ROLE) for consumer functions
    // - onlyRole(PROCESSOR_ROLE) for processor functions
    
    
    // =============================================================================
    // Constructor
    // =============================================================================
    
    /**
     * @notice Initializes the contract and sets the specified address as admin
     * @dev Automatically grants DEFAULT_ADMIN_ROLE to the initial owner
     * @param initialOwner The address that will be set as the contract admin
     */
    constructor(address initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }
    
    // =============================================================================
    // IBasicHybridCoordinator Implementation
    // =============================================================================
    
    /**
     * @notice Initiates an off-chain contract execution request
     * @dev Generates a unique nonce (requestId) and emits OffchainCallSent event
     *      Only addresses with CONSUMER_ROLE can send off-chain calls
     * @param call The encoded function call to execute on the external contract
     * @param bytecodeLocation IPFS hash or URI reference to the bytecode
     * @param currentStateLocation IPFS hash or URI reference to the current state
     * @return requestId Unique identifier for tracking this request
     */
    function sendOffchainCall(
        bytes calldata call,
        string calldata bytecodeLocation,
        string calldata currentStateLocation
    ) external onlyRole(CONSUMER_ROLE) returns (bytes32 requestId) {
        // Verify that the consumer implements IResponseOffchainCallConsumer using EIP-165
        if (!IERC165(msg.sender).supportsInterface(type(IResponseOffchainCallConsumer).interfaceId)) {
            revert ConsumerDoesNotSupportInterface(msg.sender);
        }
        
        // Generate unique request ID
        _nonce++;
        requestId = keccak256(abi.encodePacked(block.number, msg.sender, _nonce));
        
        // Create and store the new request with Sent state
        requests[requestId] = Request({
            state: RequestState.Sent,
            blockNumber: block.number,
            requester: msg.sender,
            nonce: _nonce,
            call: call,
            bytecodeLocation: bytecodeLocation,
            currentStateLocation: currentStateLocation,
            newStateLocation: "",
            returnData: ""
        });
        
        globalQueue.enqueue(requestId);
        
        
        // Emit event for off-chain backend to process
        emit OffchainCallSent(
            requestId,
            msg.sender,
            block.number,
            call,
            bytecodeLocation,
            currentStateLocation
        );
        
        return requestId;
    }
    
    /**
     * @notice Callback function invoked by the backend after completing off-chain execution
     * @dev Only addresses with PROCESSOR_ROLE can reply to requests
     * @param requestId The unique identifier of the request being responded to
     * @param newStateLocation IPFS hash or URI reference to the new state after execution
     * @param returnData The return value from the executed contract call
     */
    function replyOffchainCall(
        bytes32 requestId,
        string calldata newStateLocation,
        string calldata returnData
    ) external onlyRole(PROCESSOR_ROLE) {
        // Verify that the request exists and is in Sent state
        require(requests[requestId].state == RequestState.Sent, "Invalid request state");
        
        Request storage currentRequest = requests[requestId];
        
        if(globalQueue.peek() != requestId){
            revert errorFulfillingOutOfOrder(requestId);
        }
      
        globalQueue.dequeue();
        currentRequest.state = RequestState.Completed;
        currentRequest.newStateLocation = newStateLocation;
        currentRequest.returnData = returnData;
        
        // Emit event confirming the reply
        emit OffchainCallReplied(requestId, block.number, newStateLocation);
        
        // Call the consumer's callback function
        IResponseOffchainCallConsumer(currentRequest.requester).onOffchainCallResponse(
            requestId,
            newStateLocation,
            returnData
        );
    }

    /**
     * @notice View function to get the next request ID in the global queue
     * @dev Returns bytes32(0) if queue is empty. Backend should check for zero value.
     * @return requestId The next request ID to be processed, or bytes32(0) if queue is empty
     */
    function nextRequest() external view returns (bytes32 requestId) {
        if (globalQueue.isEmpty()) {
            return bytes32(0);
        }
        return globalQueue.peek();
    }
    
    // =============================================================================
    // Role Management
    // =============================================================================
    
    // Note: Role management is handled by OpenZeppelin's AccessControl contract
    // Available functions:
    // - grantRole(bytes32 role, address account) - only DEFAULT_ADMIN_ROLE
    // - revokeRole(bytes32 role, address account) - only DEFAULT_ADMIN_ROLE
    // - renounceRole(bytes32 role, address account) - account can renounce their own role
    // - hasRole(bytes32 role, address account) - check if account has role
    // - getRoleAdmin(bytes32 role) - get admin role for a given role
    
    // =============================================================================
    // Additional Helper Functions
    // =============================================================================
    
    /**
     * @notice Gets the current state of a request
     * @param requestId The request ID to check
     * @return RequestState The current state of the request
     */
    function getRequestState(bytes32 requestId) external view returns (RequestState) {
        return requests[requestId].state;
    }
    
    /**
     * @notice Checks if a request is still pending (Sent state, waiting for backend response)
     * @param requestId The request ID to check
     * @return bool True if the request is pending, false otherwise
     */
    function isPending(bytes32 requestId) external view returns (bool) {
        return requests[requestId].state == RequestState.Sent;
    }
    
    /**
     * @notice Retrieves the complete request data
     * @param requestId The request ID to query
     * @return Request The complete request struct
     */
    function getRequest(bytes32 requestId) external view returns (Request memory) {
        return requests[requestId];
    }
    
    /**
     * @notice Retrieves the block number when a request was made
     * @param requestId The request ID to query
     * @return uint256 The block number, or 0 if request not found
     */
    function getRequestBlock(bytes32 requestId) external view returns (uint256) {
        return requests[requestId].blockNumber;
    }
    
   
    // =============================================================================
    // Future Enhancements (To Be Implemented)
    // =============================================================================
    
    // TODO: Implement request timeout mechanism [Nice]
    // TODO: Add support for request dependencies to allow parallel processing [Must]
    // TODO: Implement callback system to notify original callers when request completes [Must]
    // TODO: Add support for request cancellation [Wont]
    // TODO: Implement request priority system [Nice]
    // TODO: Add batch request processing [Nice]
    // TODO: Implement fee mechanism for off-chain execution [Nice]
    // TODO: Add support for multiple backend servers with load balancing [Nice]
    // TODO: Implement state verification mechanism  [Wont]
    // TODO: Add support for request replay protection [Must] 
    // TODO: Implement emergency pause functionality [Nice]
}

