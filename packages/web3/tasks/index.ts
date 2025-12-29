import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export default [task("sumasuma", "Suma a + b")
  .addOption({
    name: "a",
    description: "Primer sumando",
    type: ArgumentType.STRING,
    defaultValue: "0",
  })
  .addOption({
    name: "b",
    description: "Segundo sumando",
    type: ArgumentType.STRING,
    defaultValue: "0",
  })
  // lazy-load del action (Hardhat 3 friendly)
  .setAction(() => import("./suma.js"))
  .build()];