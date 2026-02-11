import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export default [
  // task("sumasuma", "Suma a + b")
  //   .addOption({
  //     name: "a",
  //     description: "Primer sumando",
  //     type: ArgumentType.STRING,
  //     defaultValue: "0",
  //   })
  //   .addOption({
  //     name: "b",
  //     description: "Segundo sumando",
  //     type: ArgumentType.STRING,
  //     defaultValue: "0",
  //   })
  //   // lazy-load del action (Hardhat 3 friendly)
  //   .setAction(() => import("./suma_rm.js"))
  //   .build(),

  task("simulaterequest", "Simula una solicitud off-chain al ExampleConsumer")
    .addOption({
      name: "call",
      description: "Encoded function call to execute",
      type: ArgumentType.STRING,
      defaultValue: "",
    })
    .addOption({
      name: "bytecodeLocation",
      description: "IPFS location of the bytecode",
      type: ArgumentType.STRING,
      defaultValue: "",
    })
    .addOption({
      name: "currentStateLocation",
      description: "IPFS location of the current state",
      type: ArgumentType.STRING,
      defaultValue: "",
    })
    .setAction(() => import("./simulateRequest.js"))
    .build()
];