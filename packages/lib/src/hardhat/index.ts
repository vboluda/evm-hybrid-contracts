import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export default [
  task("ipfs:publish-bytecode", "Publish contract bytecode to IPFS")
    .addOption({
      name: "contract",
      description: 'Contract name (e.g., "MyToken")',
      type: ArgumentType.STRING,
      defaultValue: "",          // <-- obligatorio para addOption
    })
    .addOption({
      name: "kind",
      description: 'Bytecode kind: "runtime" or "creation"',
      type: ArgumentType.STRING,
      defaultValue: "runtime",
    })
    .addOption({
      name: "endpoint",
      description: "IPFS endpoint URL override (otherwise IPFS_ENDPOINT env)",
      type: ArgumentType.STRING,
      defaultValue: "",          // <-- idem
    })
    .setAction(() => import("./tasks/ipfsPublishBytecode.js"))
    .build(),
];
