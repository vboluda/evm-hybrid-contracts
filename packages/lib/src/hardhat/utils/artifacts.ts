/**
 * Hardhat artifact utilities
 * Helpers to read and process Hardhat compilation artifacts
 */
import fs from "node:fs/promises";
import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';

/**
 * Bytecode kind to extract from artifact
 */
export type BytecodeKind = 'runtime' | 'creation';

/**
 * Error thrown when artifact operations fail
 */
export class ArtifactError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ArtifactError';
  }
}

/**
 * Get bytecode from a Hardhat artifact
 * 
 * @param hre - Hardhat Runtime Environment
 * @param contractName - Name of the contract (e.g., "MyToken")
 * @param kind - Type of bytecode: 'runtime' (deployedBytecode) or 'creation' (bytecode)
 * @returns The bytecode as hex string (with 0x prefix)
 * 
 * @example
 * ```typescript
 * const bytecode = await getBytecodeFromArtifact(hre, 'MyToken', 'runtime');
 * console.log(bytecode); // 0x6080604052...
 * ```
 */
export async function getBytecodeFromArtifact(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  kind: BytecodeKind = 'runtime'
): Promise<string> {
  try {
    const artifact = await hre.artifacts.readArtifact(contractName);
    
    const bytecode = kind === 'runtime' 
      ? artifact.deployedBytecode 
      : artifact.bytecode;
    
    if (!bytecode || bytecode === '0x') {
      throw new ArtifactError(
        `No ${kind} bytecode found in artifact for contract "${contractName}"`,
        'EMPTY_BYTECODE',
        { contractName, kind }
      );
    }
    
    return bytecode;
  } catch (error) {
    if (error instanceof ArtifactError) {
      throw error;
    }
    
    throw new ArtifactError(
      `Failed to read artifact for contract "${contractName}": ${error instanceof Error ? error.message : String(error)}`,
      'ARTIFACT_READ_FAILED',
      { contractName, originalError: error }
    );
  }
}

/**
 * Get contract artifact metadata
 * Useful for including extra context when publishing to IPFS
 * 
 * @param hre - Hardhat Runtime Environment
 * @param contractName - Name of the contract
 * @returns Artifact metadata (compiler version, source name, etc.)
 */
export async function getArtifactMetadata(
  hre: HardhatRuntimeEnvironment,
  contractName: string
): Promise<Record<string, any>> {
  try {
    const artifact = await hre.artifacts.readArtifact(contractName);

    // Fully qualified name (FQN) en Hardhat: "path/to/File.sol:ContractName"
    const fqn = `${artifact.sourceName}:${artifact.contractName}`;

    let solcVersion = "unknown";

    // Hardhat 3: getBuildInfoId -> getBuildInfoPath -> read JSON yourself
    try {
      const buildInfoId = await hre.artifacts.getBuildInfoId(fqn);

      if (buildInfoId !== undefined) {
        const buildInfoPath = await hre.artifacts.getBuildInfoPath(buildInfoId);

        if (buildInfoPath) {
          const raw = await fs.readFile(buildInfoPath, "utf8");
          const buildInfo = JSON.parse(raw) as any;

          // En HH3 el JSON suele incluir solcVersion; si no, prueba otros campos
          solcVersion =
            buildInfo?.solcVersion ??
            buildInfo?.solcLongVersion ??
            buildInfo?.input?.settings?.compiler?.version ?? // ultra defensivo
            "unknown";
        }
      }
    } catch {
      // Si no hay build info, seguimos con solcVersion="unknown"
    }

    return {
      contractName: artifact.contractName,
      sourceName: artifact.sourceName,
      compiler: {
        version: solcVersion,
      },
      // Mantengo tu métrica basada en longitud del string hex
      ...(artifact.bytecode && { bytecodeSize: artifact.bytecode.length }),
      ...(artifact.deployedBytecode && { deployedBytecodeSize: artifact.deployedBytecode.length }),
    };
  } catch (error) {
    // Return minimal metadata if artifact/build info is not available
    return {
      contractName,
      error: "Could not read full artifact metadata",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
