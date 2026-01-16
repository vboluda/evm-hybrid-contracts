// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IBasicHybridCoordinator.sol";
import "./interfaces/IWhiteList.sol";

/**
 * @title BasicHybridCoordinator
 * @author Vicente Boluda Vias
 * @notice Coordinates hybrid on-chain/off-chain contract execution with whitelist management
 * @dev Implements both IBasicHybridCoordinator and IWhiteList interfaces
 *      Uses OpenZeppelin's Ownable for ownership management
 */
contract BasicHybridCoordinator is Ownable, IBasicHybridCoordinator, IWhiteList {
    
    // =============================================================================
    // State Variables
    // =============================================================================
    
    /// @notice Counter for generating unique request IDs (nonces)
    uint256 private _nonce;
    
    /// @notice Mapping to track whitelisted addresses
    mapping(address => bool) private _whitelist;
    
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
        bytes newStateLocation;       // IPFS location of the new state (after completion)
        bytes returnData;             // Return data from the execution
    }
    
    /// @notice Mapping to store all requests by their ID
    /// @dev Maps requestId to the Request struct containing all request data
    mapping(bytes32 => Request) public requests;
    
    /// @notice Tracks minimum pending nonce for each bytecode location
    /// @dev 0 means no pending requests, otherwise contains the smallest pending nonce
    mapping(string => uint256) private _minPendingNonceBytecode;
    
    /// @notice Tracks minimum pending nonce for each state location
    /// @dev 0 means no pending requests, otherwise contains the smallest pending nonce
    mapping(string => uint256) private _minPendingNonceState;
    
    /// @notice Maps bytecode location + nonce to requestId for fast lookup
    mapping(string => mapping(uint256 => bytes32)) private _bytecodeNonceToRequest;
    
    /// @notice Maps state location + nonce to requestId for fast lookup
    mapping(string => mapping(uint256 => bytes32)) private _stateNonceToRequest;
    
    // =============================================================================
    // Modifiers
    // =============================================================================
    
    /**
     * @notice Restricts function access to whitelisted addresses only
     */
    modifier onlyWhitelisted() {
        require(_whitelist[msg.sender], "Caller not whitelisted");
        _;
    }
    
    // =============================================================================
    // Constructor
    // =============================================================================
    
    /**
     * @notice Initializes the contract and sets the specified address as owner
     * @dev Automatically adds the initial owner to the whitelist
     * @param initialOwner The address that will be set as the contract owner
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        // EMPTY
    }
    
    // =============================================================================
    // IBasicHybridCoordinator Implementation
    // =============================================================================
    
    /**
     * @notice Initiates an off-chain contract execution request
     * @dev Generates a unique nonce (requestId) and emits OffchainCallSent event
     *      Only whitelisted addresses can send off-chain calls
     * @param call The encoded function call to execute on the external contract
     * @param bytecodeLocation IPFS hash or URI reference to the bytecode
     * @param currentStateLocation IPFS hash or URI reference to the current state
     * @return requestId Unique identifier for tracking this request
     */
    function sendOffchainCall(
        bytes calldata call,
        string calldata bytecodeLocation,
        string calldata currentStateLocation
    ) external onlyWhitelisted returns (bytes32 requestId) {
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
        
        // Register this request for the bytecode location (for serialization control)
        _bytecodeNonceToRequest[bytecodeLocation][_nonce] = requestId;
        if (_minPendingNonceBytecode[bytecodeLocation] == 0 || _nonce < _minPendingNonceBytecode[bytecodeLocation]) {
            _minPendingNonceBytecode[bytecodeLocation] = _nonce;
        }
        
        // Register this request for the state location (for serialization control)
        _stateNonceToRequest[currentStateLocation][_nonce] = requestId;
        if (_minPendingNonceState[currentStateLocation] == 0 || _nonce < _minPendingNonceState[currentStateLocation]) {
            _minPendingNonceState[currentStateLocation] = _nonce;
        }
        
        // Emit event for off-chain backend to process
        emit OffchainCallSent(
            requestId,
            block.number,
            call,
            bytecodeLocation,
            currentStateLocation
        );
        
        return requestId;
    }
    
    /**
     * @notice Callback function invoked by the backend after completing off-chain execution
     * @dev Only whitelisted backend servers can reply to requests
     * @param requestId The unique identifier of the request being responded to
     * @param newStateLocation IPFS hash or URI reference to the new state after execution
     * @param returnData The return value from the executed contract call
     */
    function replyOffchainCall(
        bytes32 requestId,
        bytes calldata newStateLocation,
        bytes calldata returnData
    ) external onlyWhitelisted {
        // Verify that the request exists and is in Sent state
        require(requests[requestId].state == RequestState.Sent, "Invalid request state");
        
        Request storage currentRequest = requests[requestId];
        
        // Verify that no earlier request (lower nonce) for the same bytecode is pending
        // O(1) check using minimum pending nonce index
        uint256 minBytecodeNonce = _minPendingNonceBytecode[currentRequest.bytecodeLocation];
        if (minBytecodeNonce != 0 && minBytecodeNonce < currentRequest.nonce) {
            revert("Earlier request for same contract is still pending");
        }
        
        // Verify that no earlier request (lower nonce) for the same state is pending
        // O(1) check using minimum pending nonce index
        uint256 minStateNonce = _minPendingNonceState[currentRequest.currentStateLocation];
        if (minStateNonce != 0 && minStateNonce < currentRequest.nonce) {
            revert("Earlier request for same state is still pending");
        }
        
        // Update request state to Completed
        requests[requestId].state = RequestState.Completed;
        requests[requestId].newStateLocation = newStateLocation;
        requests[requestId].returnData = returnData;
        
        // Update minimum pending nonce indices if this was the minimum
        // NOTE: This is O(k) where k is the gap to the next pending nonce, but only happens
        //       once per sequence when completing the minimum nonce request
        if (_minPendingNonceBytecode[currentRequest.bytecodeLocation] == currentRequest.nonce) {
            _minPendingNonceBytecode[currentRequest.bytecodeLocation] = _findNextPendingNonce(
                currentRequest.bytecodeLocation,
                currentRequest.nonce,
                true  // bytecode mapping
            );
        }
        
        if (_minPendingNonceState[currentRequest.currentStateLocation] == currentRequest.nonce) {
            _minPendingNonceState[currentRequest.currentStateLocation] = _findNextPendingNonce(
                currentRequest.currentStateLocation,
                currentRequest.nonce,
                false  // state mapping
            );
        }
        
        // Emit event confirming the reply
        emit OffchainCallReplied(requestId, block.number, newStateLocation);
        
        // TODO: Implement callback mechanism to notify the original caller
        // TODO: Handle returnData processing and forwarding
    }
    
    // =============================================================================
    // IWhiteList Implementation
    // =============================================================================
    
    /**
     * @notice Adds an address to the whitelist
     * @dev Only the owner can add addresses to the whitelist
     * @param account The address to add to the whitelist
     */
    function addToWhitelist(address account) external onlyOwner {
        require(account != address(0), "Cannot whitelist zero address");
        require(!_whitelist[account], "Already whitelisted");
        
        _whitelist[account] = true;
        emit AddressWhitelisted(account, msg.sender);
    }
    
    /**
     * @notice Removes an address from the whitelist
     * @dev Only the owner can remove addresses from the whitelist
     * @param account The address to remove from the whitelist
     */
    function removeFromWhitelist(address account) external onlyOwner {
        require(_whitelist[account], "Not whitelisted");
        
        _whitelist[account] = false;
        emit AddressRemovedFromWhitelist(account, msg.sender);
    }
    
    /**
     * @notice Checks if an address is whitelisted
     * @param account The address to check
     * @return bool True if the address is whitelisted, false otherwise
     */
    function isWhitelisted(address account) external view returns (bool) {
        return _whitelist[account];
    }
    
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
    
    /**
     * @notice Checks if a request can be processed (no earlier requests pending for same contract or state)
     * @dev Used by backend to verify if a request can be executed in parallel
     *      Two requests on the same offchain contract OR same state must be executed serially by nonce order
     * @param requestId The request ID to check
     * @return canProcess True if the request can be processed now, false if must wait
     * @return blockingRequestId The ID of the blocking request (if any), or bytes32(0) if none
     */
    function canProcessRequest(bytes32 requestId) external view returns (bool canProcess, bytes32 blockingRequestId) {
        Request memory currentRequest = requests[requestId];
        require(currentRequest.state != RequestState.None, "Request does not exist");
        
        // If already completed, return true
        if (currentRequest.state == RequestState.Completed) {
            return (true, bytes32(0));
        }
        
        // Check if any earlier request (lower nonce) for the same bytecode is still pending
        // O(1) check using minimum pending nonce index
        uint256 minBytecodeNonce = _minPendingNonceBytecode[currentRequest.bytecodeLocation];
        if (minBytecodeNonce != 0 && minBytecodeNonce < currentRequest.nonce) {
            bytes32 blockingReqId = _bytecodeNonceToRequest[currentRequest.bytecodeLocation][minBytecodeNonce];
            return (false, blockingReqId);
        }
        
        // Check if any earlier request (lower nonce) for the same state is still pending
        // O(1) check using minimum pending nonce index
        uint256 minStateNonce = _minPendingNonceState[currentRequest.currentStateLocation];
        if (minStateNonce != 0 && minStateNonce < currentRequest.nonce) {
            bytes32 blockingReqId = _stateNonceToRequest[currentRequest.currentStateLocation][minStateNonce];
            return (false, blockingReqId);
        }
        
        // No blocking requests found
        return (true, bytes32(0));
    }
    
    // =============================================================================
    // Internal Helper Functions
    // =============================================================================
    
    /**
     * @notice Finds the next pending nonce after the current one for a given location
     * @dev Searches forward from currentNonce+1 up to _nonce to find next Sent request
     *      Complexity: O(k) where k is the gap until the next pending request
     *      This only executes once per sequence when completing the minimum nonce request
     * @param location The bytecode or state location string
     * @param currentNonce The nonce that was just completed
     * @param isBytecode True if searching bytecode mapping, false for state mapping
     * @return Next pending nonce, or 0 if none found
     */
    function _findNextPendingNonce(
        string memory location,
        uint256 currentNonce,
        bool isBytecode
    ) private view returns (uint256) {
        // Search for next pending request starting from currentNonce + 1
        for (uint256 nextNonce = currentNonce + 1; nextNonce <= _nonce; nextNonce++) {
            bytes32 nextRequestId = isBytecode 
                ? _bytecodeNonceToRequest[location][nextNonce]
                : _stateNonceToRequest[location][nextNonce];
            
            // If there's a request at this nonce and it's still pending
            if (nextRequestId != bytes32(0) && requests[nextRequestId].state == RequestState.Sent) {
                return nextNonce;
            }
        }
        
        // No pending requests found
        return 0;
    }
    
    // =============================================================================
    // Future Enhancements (To Be Implemented)
    // =============================================================================
    
    // TODO: Implement request timeout mechanism [Nice]
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

