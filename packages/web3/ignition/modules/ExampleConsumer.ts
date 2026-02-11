import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import BasicHybridCoordinatorModule from "./BasicHybridCoordinator";
import { ethers } from "ethers";

/**
 * Ignition module for deploying ExampleConsumer
 * 
 * This module deploys the ExampleConsumer contract which depends on
 * the BasicHybridCoordinator. It automatically deploys the coordinator
 * first if not already deployed.
 * 
 * Parameters can be customized:
 * - bytecodeLocation: IPFS hash or URI for the bytecode (default: "ipfs://QmExample123")
 * - currentStateLocation: IPFS hash or URI for the current state (default: "ipfs://QmState456")
 */
const ExampleConsumerModule = buildModule("ExampleConsumerModule", (m) => {
  // Import the coordinator from the BasicHybridCoordinator module
  const { coordinator } = m.useModule(BasicHybridCoordinatorModule);

  // Define parameters with default values
  const bytecodeLocation = m.getParameter("bytecodeLocation", "ipfs://QmExample123");
  const currentStateLocation = m.getParameter("currentStateLocation", "ipfs://QmState456");

  // Deploy the ExampleConsumer contract
  const consumer = m.contract("ExampleConsumer", [
    coordinator,
    bytecodeLocation,
    currentStateLocation,
  ]);

   // bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");
    const CONSUMER_ROLE = ethers.id("CONSUMER_ROLE");
  
  // Grant role on the coordinator to the consumer contract address
  // Assumes coordinator uses OpenZeppelin AccessControl and deployer has DEFAULT_ADMIN_ROLE.
  const coordinatorCallable = m.contractAt("BasicHybridCoordinator", coordinator);
  m.call(coordinatorCallable, "grantRole", [CONSUMER_ROLE, consumer]);

  return { consumer, coordinator };
});

export default ExampleConsumerModule;
