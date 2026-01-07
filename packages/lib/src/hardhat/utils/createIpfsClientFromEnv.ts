/**
 * IPFS Client factory from environment variables
 * Creates configured IpfsClient instances for Hardhat tasks
 */

import { IpfsClient, IpfsClientConfig } from '../../ipfs/IpfsClient.js';

/**
 * Environment variables for IPFS configuration
 */
export interface IpfsEnvConfig {
  /**
   * IPFS endpoint URL
   * @default http://127.0.0.1:5001
   * @env IPFS_ENDPOINT
   */
  endpoint?: string;

  /**
   * IPFS mode: kubo-api or gateway
   * @default kubo-api
   * @env IPFS_MODE
   */
  mode?: 'kubo-api' | 'gateway';

  /**
   * Request timeout in milliseconds
   * @default 30000
   * @env IPFS_TIMEOUT
   */
  timeout?: number;

  /**
   * Bearer token for authentication
   * @env IPFS_TOKEN
   */
  token?: string;

  /**
   * Project ID for Basic authentication (e.g., Infura)
   * @env IPFS_PROJECT_ID
   */
  projectId?: string;

  /**
   * Project secret for Basic authentication (e.g., Infura)
   * @env IPFS_PROJECT_SECRET
   */
  projectSecret?: string;

  /**
   * Default metadata to include in all payloads (JSON string)
   * @env IPFS_DEFAULT_METADATA
   */
  defaultMetadata?: string;
}

/**
 * Parse IPFS configuration from environment variables
 * 
 * @param override - Optional overrides for specific values
 * @returns Parsed configuration
 */
export function getIpfsConfigFromEnv(override?: Partial<IpfsEnvConfig>): IpfsClientConfig {
  const endpoint = override?.endpoint || process.env.IPFS_ENDPOINT || 'http://127.0.0.1:5001';
  const mode = (override?.mode || process.env.IPFS_MODE || 'kubo-api') as 'kubo-api' | 'gateway';
  const timeout = override?.timeout 
    ? override.timeout 
    : (process.env.IPFS_TIMEOUT ? parseInt(process.env.IPFS_TIMEOUT, 10) : 30000);
  
  const token = override?.token || process.env.IPFS_TOKEN;
  const projectId = override?.projectId || process.env.IPFS_PROJECT_ID;
  const projectSecret = override?.projectSecret || process.env.IPFS_PROJECT_SECRET;
  
  // Parse default metadata if provided as JSON string
  let defaultMetadata: Record<string, any> | undefined;
  const metadataStr = override?.defaultMetadata || process.env.IPFS_DEFAULT_METADATA;
  if (metadataStr) {
    try {
      defaultMetadata = JSON.parse(metadataStr);
    } catch (error) {
      console.warn(`Failed to parse IPFS_DEFAULT_METADATA: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Build credentials object
  const credentials: Record<string, any> = {};
  if (projectId && projectSecret) {
    credentials.projectId = projectId;
    credentials.projectSecret = projectSecret;
  }
  if (token) {
    credentials.token = token;
  }
  
  // Build headers for authentication
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (projectId && projectSecret) {
    const auth = Buffer.from(`${projectId}:${projectSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }
  
  return {
    endpointUrl: endpoint,
    mode,
    timeout,
    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    defaultMetadata,
  };
}

/**
 * Create an IpfsClient from environment variables
 * 
 * @param override - Optional overrides for specific values
 * @returns Configured IpfsClient instance
 * 
 * @example
 * ```typescript
 * // Using default environment variables
 * const client = createIpfsClientFromEnv();
 * 
 * // With endpoint override
 * const client = createIpfsClientFromEnv({ endpoint: 'http://192.168.1.6:5001' });
 * ```
 */
export function createIpfsClientFromEnv(override?: Partial<IpfsEnvConfig>): IpfsClient {
  const config = getIpfsConfigFromEnv(override);
  return new IpfsClient(config);
}
