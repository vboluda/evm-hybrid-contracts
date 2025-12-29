import { suma } from "lib";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";

export default async function (
  taskArgs: { a: string; b: string },
  _hre: HardhatRuntimeEnvironment
) {
  const result = suma(taskArgs.a, taskArgs.b);
  console.log(`Resultado: ${result}`);
}