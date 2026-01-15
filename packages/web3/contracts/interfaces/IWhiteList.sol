// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IWhiteList
 * @author Vicente Boluda Vias
 * @notice Interface for whitelist management functionality
 * @dev Defines the standard functions and events for managing whitelisted addresses
 */
interface IWhiteList {
    
    // =============================================================================
    // Events
    // =============================================================================
    
    /**
     * @notice Emitted when an address is added to the whitelist
     * @param account The address that was added to the whitelist
     * @param addedBy The address that performed the addition
     */
    event AddressWhitelisted(address indexed account, address indexed addedBy);
    
    /**
     * @notice Emitted when an address is removed from the whitelist
     * @param account The address that was removed from the whitelist
     * @param removedBy The address that performed the removal
     */
    event AddressRemovedFromWhitelist(address indexed account, address indexed removedBy);
    
    // =============================================================================
    // Functions
    // =============================================================================
    
    /**
     * @notice Adds an address to the whitelist
     * @dev Should emit AddressWhitelisted event on success
     * @param account The address to add to the whitelist
     */
    function addToWhitelist(address account) external;
    
    /**
     * @notice Removes an address from the whitelist
     * @dev Should emit AddressRemovedFromWhitelist event on success
     * @param account The address to remove from the whitelist
     */
    function removeFromWhitelist(address account) external;
    
    /**
     * @notice Checks if an address is whitelisted
     * @param account The address to check
     * @return bool True if the address is whitelisted, false otherwise
     */
    function isWhitelisted(address account) external view returns (bool);   
}
