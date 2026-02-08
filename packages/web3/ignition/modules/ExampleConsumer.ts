import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import BasicHybridCoordinatorModule from "./BasicHybridCoordinator";

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

  return { consumer, coordinator };
});

export default ExampleConsumerModule;
