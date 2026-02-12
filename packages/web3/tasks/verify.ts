import { task } from "hardhat/config";
import fs from "fs";
import path from "path";

task("verify-ignition", "Verify Ignition contracts using journal JSONL")
  .setAction(async (_, hre) => {

    console.log("\n========== VERIFY IGNITION (JSONL) ==========\n");

    const network = await hre.ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("Network:", hre.network.name);
    console.log("ChainId:", chainId);

    const basePath = path.join(
      hre.config.paths.root,
      "ignition",
      "deployments",
      `chain-${chainId}`
    );

    const addressesPath = path.join(basePath, "deployed_addresses.json");
    const artifactsDir = path.join(basePath, "artifacts");
    const journalPath = path.join(basePath, "journal.jsonl");

    console.log("\nResolved paths:");
    console.log("basePath:", basePath);
    console.log("addressesPath:", addressesPath);
    console.log("artifactsDir:", artifactsDir);
    console.log("journalPath:", journalPath);

    if (!fs.existsSync(addressesPath)) {
      throw new Error("deployed_addresses.json not found");
    }

    if (!fs.existsSync(journalPath)) {
      throw new Error("journal.json not found");
    }

    const deployed = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

    // 🔥 Leer JSONL correctamente
    const journalLines = fs
      .readFileSync(journalPath, "utf8")
      .split("\n")
      .filter(Boolean);

    const constructorMap: Record<string, any[]> = {};

    for (const line of journalLines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === "DEPLOYMENT_EXECUTION_STATE_INITIALIZE") {
          constructorMap[entry.artifactId] = entry.constructorArgs || [];
        }

      } catch (err) {
        console.warn("⚠ Failed to parse journal line");
      }
    }

    console.log("\nConstructor map extracted from journal:");
    console.log(constructorMap);

    const verifiedAddresses = new Set<string>();

    console.log("\n🔎 Starting verification...\n");

    for (const key of Object.keys(deployed)) {

      const address = deployed[key];

      console.log("--------------------------------------------------");
      console.log("ArtifactId:", key);
      console.log("Address:", address);

      if (verifiedAddresses.has(address)) {
        console.log("⚠ Skipping duplicate address");
        continue;
      }

      const artifactPath = path.join(artifactsDir, `${key}.json`);

      if (!fs.existsSync(artifactPath)) {
        console.log("⚠ No artifact JSON found, skipping");
        continue;
      }

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

      const fullyQualifiedName =
        `${artifact.sourceName}:${artifact.contractName}`;

      const constructorArgs = constructorMap[key] || [];

      console.log("FullyQualifiedName:", fullyQualifiedName);
      console.log("ConstructorArgs:", constructorArgs);

      try {
        await hre.run("verify:verify", {
          address,
          constructorArguments: constructorArgs,
          contract: fullyQualifiedName,
        });

        console.log("✅ Verified successfully");

      } catch (err: any) {
        if (err.message?.includes("Already Verified")) {
          console.log("ℹ Already verified");
        } else {
          console.error("❌ Verification failed:", err.message);
        }
      }

      verifiedAddresses.add(address);
    }

    console.log("\n========== DONE ==========\n");
  });
