// hardhat.config.ts (Hardhat v2)

import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-verify";

// In HH2, tasks are registered when their modules are imported
//import "lib/hardhat";
//import "./tasks";

const {
  SEPOLIA_RPC_URL,
  SEPOLIA_PRIVATE_KEY,
  HOODI_RPC_URL,
  HOODI_PRIVATE_KEY,
} = process.env;

function requireEnv(name: string, value?: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  etherscan: {
    apiKey: {
      hoodi: process.env.ETHERSCAN_API_KEY!,
    },
    customChains: [
      {
        network: "hoodi",
        chainId: 560048,
        urls: {
          // Etherscan API V2 (multichain)
          apiURL: "https://api.etherscan.io/v2/api?chainid=560048",
          // Explorer de Hoodi
          browserURL: "https://hoodi.etherscan.io",
        },
      },
    ],
  },

  networks: {
    // HH2 local network (replaces HH3 simulated networks)
    hardhat: {
      chainId: 31337,
    },

    sepolia: {
      url: SEPOLIA_RPC_URL
        ? requireEnv("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL)
        : "",
      chainId: 11155111,
      accounts: SEPOLIA_PRIVATE_KEY
        ? [requireEnv("SEPOLIA_PRIVATE_KEY", SEPOLIA_PRIVATE_KEY)]
        : [],
    },

    hoodi: {
      url: HOODI_RPC_URL
        ? requireEnv("HOODI_RPC_URL", HOODI_RPC_URL)
        : "",
      chainId: 560048,
      accounts: HOODI_PRIVATE_KEY
        ? [requireEnv("HOODI_PRIVATE_KEY", HOODI_PRIVATE_KEY)]
        : [],
    },
  },
};

export default config;
