import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition module for deploying BasicHybridCoordinator
 * 
 * This module deploys the BasicHybridCoordinator contract with the deployer
 * address as the initial owner (admin).
 */
const BasicHybridCoordinatorModule = buildModule("BasicHybridCoordinatorModule", (m) => {
  // Get the deployer account to use as initial owner
  const initialOwner = m.getAccount(0);

  // Deploy the BasicHybridCoordinator contract
  const coordinator = m.contract("BasicHybridCoordinator", [initialOwner]);

  return { coordinator };
});

export default BasicHybridCoordinatorModule;
