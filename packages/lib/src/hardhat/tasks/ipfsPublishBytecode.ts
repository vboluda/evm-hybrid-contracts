import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { createIpfsClientFromEnv } from "../utils/createIpfsClientFromEnv.js";
import { getBytecodeFromArtifact } from "../utils/artifacts.js";

type BytecodeKind = "runtime" | "creation";

interface Args {
  contract: string;
  kind: string;
  endpoint: string;
}

export async function getChainId(
  hre: HardhatRuntimeEnvironment
): Promise<string> {
  try {
    const conn = await hre.network.connect();

    // Provider EIP-1193 (Hardhat 3)
    const chainIdHex = await conn.provider.request({
      method: "eth_chainId",
      params: [],
    });

    // chainId viene en hex (ej. "0x1", "0xaa36a7")
    return String(Number(chainIdHex));
  } catch (error) {
    console.warn(
      `⚠️  Could not fetch chainId from RPC endpoint: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return "unknown";
  }
}
export default async function ipfsPublishBytecodeAction(
  args: Args,
  hre: HardhatRuntimeEnvironment
): Promise<string> {
  const contract = (args.contract ?? "").trim();
  if (!contract) {
    throw new Error(`Missing --contract. Example: --contract MyToken`);
  }

  const kind: BytecodeKind =
    args.kind === "creation" ? "creation" : "runtime";

  if (args.kind !== "runtime" && args.kind !== "creation") {
    throw new Error(`Invalid --kind="${args.kind}". Must be "runtime" or "creation".`);
  }

  const bytecode = await getBytecodeFromArtifact(hre, contract, kind);

  const ipfsClient = createIpfsClientFromEnv(
    args.endpoint?.trim() ? { endpoint: args.endpoint.trim() } : undefined
  );

  //const chainId = await getChainId(hre);
  const conn = await hre.network.connect();

  const metadata = {
    contractName: contract,
    kind,
    network: conn.networkName,
    chainId: await getChainId(hre),
    publishedAt: new Date().toISOString(),
  };

  const cid = await ipfsClient.publishContractCode(bytecode, metadata);

  console.log(cid);
  return cid;
}
