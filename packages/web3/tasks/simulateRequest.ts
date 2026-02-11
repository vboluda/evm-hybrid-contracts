import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { BrowserProvider, Contract, Interface, Wallet } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.connect();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TaskArgs {
    call: string;
    bytecodeLocation: string;
    currentStateLocation: string;
}

// function getPrivateKeyForNetwork(networkName: string): string {
//     const envName = `${networkName.toUpperCase()}_PRIVATE_KEY`; // HOODI_PRIVATE_KEY, SEPOLIA_PRIVATE_KEY, ...
//     const pk = process.env[envName];
//     if (!pk) {
//         throw new Error(`❌ Missing ${envName} in environment`);
//     }
//     return pk.startsWith("0x") ? pk : `0x${pk}`;
// }

/**
 * Task action to simulate an off-chain request to ExampleConsumer
 */
export default async function (
    { call, bytecodeLocation, currentStateLocation }: TaskArgs,
    hre: HardhatRuntimeEnvironment
): Promise<string> {
    console.log("\n🚀 Starting off-chain request simulation...\n");

    // Hardhat v3 connection (EIP-1193 provider)
    const conn = await hre.network.connect();

    // Get real chainId from the connected provider
    const chainIdHex = await conn.provider.request({
        method: "eth_chainId",
        params: [],
    });

    const chainId = Number(chainIdHex);

    console.log(
        `🔗 Connected to network with chainId: ${chainId}\n`
    );

    
    // Wrap EIP-1193 provider with ethers v6
    
      // Build the path to the deployed addresses file
      const deploymentPath = path.join(
          __dirname,
          "..",
          "ignition",
          "deployments",
          `chain-${chainId}`,
          "deployed_addresses.json"
        );
        
        if (!fs.existsSync(deploymentPath)) {
            console.warn(" make sure contatracts are deployed and the deployment file exists");
            throw new Error(`❌ Deployment file not found for chain-${chainId}\nPath: ${deploymentPath}`);
        }
        
        const deployedAddresses = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
        
        const coordinatorAddress =
        deployedAddresses["BasicHybridCoordinatorModule#BasicHybridCoordinator"];
        const consumerAddress = deployedAddresses["ExampleConsumerModule#ExampleConsumer"];
        
        if (!coordinatorAddress || !consumerAddress) {
            throw new Error("❌ Contract addresses not found in deployment");
        }
        
        console.log(`📍 BasicHybridCoordinator: ${coordinatorAddress}`);
        console.log(`📍 ExampleConsumer: ${consumerAddress}\n`);
        
        // Get the ABIs
        const coordinatorArtifact = await hre.artifacts.readArtifact("BasicHybridCoordinator");
        const consumerArtifact = await hre.artifacts.readArtifact("ExampleConsumer");
        
        // Create signer from env private key (works for http networks like hoodi/sepolia)
       const [signer] = await ethers.getSigners();
        const signerAddress = await signer.getAddress();
        
        console.log(`👤 Account: ${signerAddress}\n`);

    //   // Create contract instance
      const consumer = new Contract(consumerAddress, consumerArtifact.abi, signer);

      console.log("📝 Request parameters:");
      console.log(`   call: ${call}`);
      console.log(`   bytecodeLocation: ${bytecodeLocation}`);
      console.log(`   currentStateLocation: ${currentStateLocation}\n`);

      console.log("📤 Sending transaction...");
      const tx = await consumer.requestOffchainExecution(call, bytecodeLocation, currentStateLocation);

      console.log("✅ Transaction sent!");
      console.log(`🔗 Hash: ${tx.hash}\n`);

      console.log("⏳ Waiting for confirmation...");
      const receipt = await tx.wait();
      if (!receipt) throw new Error("❌ No receipt returned from tx.wait()");
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}\n`);

      console.log("🔍 Searching for OffchainCallSent event...\n");

      const eventInterface = new Interface(coordinatorArtifact.abi);

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== coordinatorAddress.toLowerCase()) continue;

        try {
          const parsedLog = eventInterface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });

          if (parsedLog?.name === "OffchainCallSent") {
            console.log("📢 OffchainCallSent event emitted:");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(`   requestId: ${parsedLog.args.requestId}`);
            console.log(`   nonce: ${parsedLog.args.nonce}`);
            console.log(`   caller: ${parsedLog.args.caller}`);
            console.log(`   sender: ${parsedLog.args.sender}`);
            console.log(`   block: ${parsedLog.args.block}`);
            console.log(`   call: ${parsedLog.args.call}`);
            console.log(`   bytecodeLocation: ${parsedLog.args.bytecodeLocation}`);
            console.log(`   currentStateLocation: ${parsedLog.args.currentStateLocation}`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
          }
        } catch {
          // Not that event, ignore
        }
      }

      console.log("✨ Simulation completed successfully!\n");
      return tx.hash;
}
