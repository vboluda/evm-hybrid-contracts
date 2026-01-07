/**
 * IPFS Client - Generic IPFS operations for contract code and data
 * 
 * Provider-agnostic client that works with any IPFS HTTP endpoint
 * (Kubo HTTP API, Infura IPFS, Pinata, Helia, etc.)
 * 
 * @example
 * ```typescript
 * // Using Kubo local node
 * const client = new IpfsClient({
 *   endpointUrl: 'http://127.0.0.1:5001',
 *   mode: 'kubo-api',
 *   defaultMetadata: { author: 'my-dapp', version: '1.0.0' }
 * });
 * 
 * // Using Infura IPFS
 * const client = new IpfsClient({
 *   endpointUrl: 'https://ipfs.infura.io:5001',
 *   mode: 'kubo-api',
 *   credentials: {
 *     projectId: 'YOUR_PROJECT_ID',
 *     projectSecret: 'YOUR_PROJECT_SECRET'
 *   }
 * });
 * 
 * // Using IPFS Gateway
 * const client = new IpfsClient({
 *   endpointUrl: 'https://ipfs.io',
 *   mode: 'gateway'
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Contract bytecode payload stored in IPFS
 */
export interface ContractCodePayload {
  kind: 'contract_code';
  bytecode: string;
  metadata?: Record<string, any>;
}

/**
 * Generic contract data payload stored in IPFS
 * Used for ABI, sources, compiler info, network info, etc.
 */
export interface ContractDataPayload<T = unknown> {
  kind: 'contract_data';
  schemaId?: string;
  data: T;
  metadata?: Record<string, any>;
}

/**
 * IPFS Client configuration options
 */
export interface IpfsClientConfig {
  /**
   * Base URL of the IPFS API endpoint
   * @example 'http://127.0.0.1:5001'
   * @example 'https://ipfs.infura.io:5001'
   * @example 'https://ipfs.io'
   */
  endpointUrl: string;

  /**
   * Credentials for authentication (provider-specific)
   * Can include: tokens, basic auth, headers, projectId/secret, etc.
   */
  credentials?: Record<string, any>;

  /**
   * Default metadata to include in all payloads
   * Can include: author, license, version, etc.
   */
  defaultMetadata?: Record<string, any>;

  /**
   * Operation mode
   * - 'kubo-api': Use Kubo HTTP API endpoints (/api/v0/add, /api/v0/cat)
   * - 'gateway': Use IPFS gateway endpoints (/ipfs/{cid})
   * @default 'kubo-api'
   */
  mode?: 'kubo-api' | 'gateway';

  /**
   * Custom fetch implementation (for Node.js < 18 or polyfills)
   * @default globalThis.fetch
   */
  fetchImpl?: typeof fetch;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Additional HTTP headers to include in all requests
   */
  headers?: Record<string, string>;
}

/**
 * IPFS operation error
 */
export class IpfsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'IpfsError';
  }
}

// ============================================================================
// IPFS Client Implementation
// ============================================================================

/**
 * Generic IPFS client for contract code and data operations
 * 
 * This client is provider-agnostic and works with any IPFS HTTP endpoint.
 * It supports both Kubo HTTP API and IPFS Gateway modes.
 */
export class IpfsClient {
  private readonly endpointUrl: string;
  private readonly credentials?: Record<string, any>;
  private readonly defaultMetadata?: Record<string, any>;
  private readonly mode: 'kubo-api' | 'gateway';
  private readonly fetchImpl: typeof fetch;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;

  /**
   * Creates a new IPFS client instance
   * 
   * @param config - Client configuration
   * 
   * @example
   * ```typescript
   * const client = new IpfsClient({
   *   endpointUrl: 'http://127.0.0.1:5001',
   *   mode: 'kubo-api',
   *   defaultMetadata: { author: 'my-dapp' }
   * });
   * ```
   */
  constructor(config: IpfsClientConfig) {
    this.endpointUrl = config.endpointUrl.replace(/\/$/, ''); // Remove trailing slash
    this.credentials = config.credentials;
    this.defaultMetadata = config.defaultMetadata;
    this.mode = config.mode ?? 'kubo-api';
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.timeout = config.timeout ?? 30000;
    this.headers = config.headers ?? {};

    if (!this.fetchImpl) {
      throw new IpfsError(
        'fetch is not available. Please provide a fetch implementation.',
        'FETCH_NOT_AVAILABLE'
      );
    }
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Publishes contract bytecode to IPFS
   * 
   * @param bytecode - Contract bytecode (hex string, with or without 0x prefix)
   * @param metadata - Optional metadata to include in the payload
   * @returns CID of the published content
   * 
   * @example
   * ```typescript
   * const cid = await client.publishContractCode(
   *   '0x608060405234801561001057600080fd5b50...',
   *   { compiler: 'solc 0.8.28', optimization: true }
   * );
   * console.log('Published at:', cid);
   * ```
   */
  async publishContractCode(
    bytecode: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    // Validate input
    if (!bytecode || typeof bytecode !== 'string') {
      throw new IpfsError('Bytecode must be a non-empty string', 'INVALID_BYTECODE');
    }

    // Normalize bytecode (ensure 0x prefix)
    const normalizedBytecode = bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`;

    // Create payload
    const payload: ContractCodePayload = {
      kind: 'contract_code',
      bytecode: normalizedBytecode,
      metadata: this.mergeMetadata(metadata)
    };

    // Publish to IPFS
    return this.addJson(payload);
  }

  /**
   * Retrieves contract bytecode from IPFS
   * 
   * @param cid - Content identifier
   * @returns Bytecode and metadata
   * 
   * @example
   * ```typescript
   * const { bytecode, metadata } = await client.getContractCode('QmX...');
   * console.log('Bytecode:', bytecode);
   * console.log('Metadata:', metadata);
   * ```
   */
  async getContractCode(cid: string): Promise<{
    bytecode: string;
    metadata?: Record<string, any>;
  }> {
    // Validate input
    if (!cid || typeof cid !== 'string') {
      throw new IpfsError('CID must be a non-empty string', 'INVALID_CID');
    }

    // Retrieve from IPFS
    const payload = await this.catJson<ContractCodePayload>(cid);

    // Validate payload structure
    if (payload.kind !== 'contract_code') {
      throw new IpfsError(
        `Invalid payload kind: expected 'contract_code', got '${payload.kind}'`,
        'INVALID_PAYLOAD_KIND',
        { payload }
      );
    }

    if (!payload.bytecode || typeof payload.bytecode !== 'string') {
      throw new IpfsError(
        'Payload does not contain valid bytecode',
        'INVALID_PAYLOAD_STRUCTURE',
        { payload }
      );
    }

    return {
      bytecode: payload.bytecode,
      metadata: payload.metadata
    };
  }

  /**
   * Publishes generic contract data to IPFS
   * 
   * This method can be used for ABI, source code, compiler info, network info, etc.
   * 
   * @param data - Data to publish (will be serialized to JSON)
   * @param metadata - Optional metadata to include in the payload
   * @param schemaId - Optional schema identifier for versioning
   * @returns CID of the published content
   * 
   * @example
   * ```typescript
   * // Publish ABI
   * const abiCid = await client.publishContractData(
   *   contractAbi,
   *   { name: 'MyContract', version: '1.0.0' },
   *   'abi-v1'
   * );
   * 
   * // Publish deployment info
   * const deployCid = await client.publishContractData(
   *   { address: '0x123...', network: 'sepolia', blockNumber: 12345 },
   *   { deployedBy: '0xabc...' },
   *   'deployment-v1'
   * );
   * ```
   */
  async publishContractData<T>(
    data: T,
    metadata?: Record<string, any>,
    schemaId?: string
  ): Promise<string> {
    // Validate input
    if (data === null || data === undefined) {
      throw new IpfsError('Data cannot be null or undefined', 'INVALID_DATA');
    }

    // Create payload
    const payload: ContractDataPayload<T> = {
      kind: 'contract_data',
      data,
      metadata: this.mergeMetadata(metadata)
    };

    if (schemaId) {
      payload.schemaId = schemaId;
    }

    // Publish to IPFS
    return this.addJson(payload);
  }

  /**
   * Retrieves generic contract data from IPFS
   * 
   * @param cid - Content identifier
   * @returns Data, metadata, and schema ID
   * 
   * @example
   * ```typescript
   * const { data, metadata, schemaId } = await client.getContractData<ABI>('QmX...');
   * console.log('ABI:', data);
   * console.log('Schema:', schemaId);
   * ```
   */
  async getContractData<T = unknown>(cid: string): Promise<{
    data: T;
    metadata?: Record<string, any>;
    schemaId?: string;
  }> {
    // Validate input
    if (!cid || typeof cid !== 'string') {
      throw new IpfsError('CID must be a non-empty string', 'INVALID_CID');
    }

    // Retrieve from IPFS
    const payload = await this.catJson<ContractDataPayload<T>>(cid);

    // Validate payload structure
    if (payload.kind !== 'contract_data') {
      throw new IpfsError(
        `Invalid payload kind: expected 'contract_data', got '${payload.kind}'`,
        'INVALID_PAYLOAD_KIND',
        { payload }
      );
    }

    if (!('data' in payload)) {
      throw new IpfsError(
        'Payload does not contain data field',
        'INVALID_PAYLOAD_STRUCTURE',
        { payload }
      );
    }

    return {
      data: payload.data,
      metadata: payload.metadata,
      schemaId: payload.schemaId
    };
  }

  // ==========================================================================
  // Internal Helper Methods
  // ==========================================================================

  /**
   * Adds a JSON object to IPFS
   * 
   * @param obj - Object to serialize and publish
   * @returns CID of the published content
   */
  private async addJson(obj: unknown): Promise<string> {
    try {
      // Serialize to JSON with UTF-8 encoding
      const jsonString = JSON.stringify(obj);
      const jsonBytes = new TextEncoder().encode(jsonString);

      if (this.mode === 'kubo-api') {
        return await this.addJsonKuboApi(jsonBytes);
      } else {
        // For gateway mode, we need an alternative approach
        // Many gateways don't support writes, so this should fail gracefully
        throw new IpfsError(
          'Gateway mode does not support write operations. Use kubo-api mode or a writable endpoint.',
          'WRITE_NOT_SUPPORTED_IN_GATEWAY_MODE'
        );
      }
    } catch (error) {
      if (error instanceof IpfsError) {
        throw error;
      }
      throw new IpfsError(
        `Failed to add JSON to IPFS: ${error instanceof Error ? error.message : String(error)}`,
        'ADD_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Adds JSON content using Kubo HTTP API
   */
  private async addJsonKuboApi(jsonBytes: Uint8Array): Promise<string> {
    // Create multipart/form-data body
    const boundary = `----IpfsClientBoundary${Date.now()}${Math.random().toString(36)}`;
    const formDataParts: Uint8Array[] = [];

    // Add form-data header
    const header = new TextEncoder().encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="data.json"\r\n` +
      `Content-Type: application/json\r\n\r\n`
    );
    formDataParts.push(header);

    // Add JSON content
    formDataParts.push(jsonBytes);

    // Add form-data footer
    const footer = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    formDataParts.push(footer);

    // Combine all parts
    const totalLength = formDataParts.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of formDataParts) {
      body.set(part, offset);
      offset += part.length;
    }

    // Prepare headers
    const headers = this.buildHeaders({
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    });

    // Make request with timeout
    const url = `${this.endpointUrl}/api/v0/add?pin=true`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new IpfsError(
        `IPFS add failed: ${response.status} ${response.statusText}`,
        'ADD_REQUEST_FAILED',
        { status: response.status, errorText }
      );
    }

    // Parse response
    const result = await response.json();
    
    if (!result.Hash) {
      throw new IpfsError(
        'IPFS add response does not contain Hash',
        'INVALID_ADD_RESPONSE',
        { result }
      );
    }

    return result.Hash;
  }

  /**
   * Retrieves and parses a JSON object from IPFS
   * 
   * @param cid - Content identifier
   * @returns Parsed JSON object
   */
  private async catJson<T = unknown>(cid: string): Promise<T> {
    try {
      let url: string;
      let headers: Record<string, string>;

      if (this.mode === 'kubo-api') {
        // Use Kubo HTTP API cat endpoint
        url = `${this.endpointUrl}/api/v0/cat?arg=${encodeURIComponent(cid)}`;
        headers = this.buildHeaders();
      } else {
        // Use IPFS Gateway
        url = `${this.endpointUrl}/ipfs/${encodeURIComponent(cid)}`;
        headers = this.buildHeaders();
      }

      // Make request with timeout
      const response = await this.fetchWithTimeout(url, {
        method: 'POST', // Kubo API uses POST for cat
        headers
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new IpfsError(
          `IPFS cat failed: ${response.status} ${response.statusText}`,
          'CAT_REQUEST_FAILED',
          { status: response.status, errorText, cid }
        );
      }

      // Parse JSON
      const text = await response.text();
      const parsed = JSON.parse(text);

      return parsed as T;
    } catch (error) {
      if (error instanceof IpfsError) {
        throw error;
      }
      throw new IpfsError(
        `Failed to retrieve JSON from IPFS: ${error instanceof Error ? error.message : String(error)}`,
        'CAT_FAILED',
        { originalError: error, cid }
      );
    }
  }

  /**
   * Merges default metadata with provided metadata
   */
  private mergeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!this.defaultMetadata && !metadata) {
      return undefined;
    }

    return {
      ...this.defaultMetadata,
      ...metadata
    };
  }

  /**
   * Builds request headers with authentication and custom headers
   */
  private buildHeaders(additional?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.headers,
      ...additional
    };

    // Add authentication based on credentials
    if (this.credentials) {
      // Basic Auth (common for Infura)
      if (this.credentials.projectId && this.credentials.projectSecret) {
        const auth = Buffer.from(
          `${this.credentials.projectId}:${this.credentials.projectSecret}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }
      
      // Bearer token
      if (this.credentials.token) {
        headers['Authorization'] = `Bearer ${this.credentials.token}`;
      }
      
      // API key header
      if (this.credentials.apiKey) {
        headers['X-API-Key'] = this.credentials.apiKey;
      }
      
      // Custom headers
      if (this.credentials.headers) {
        Object.assign(headers, this.credentials.headers);
      }
    }

    return headers;
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new IpfsError(
          `Request timeout after ${this.timeout}ms`,
          'TIMEOUT',
          { url, timeout: this.timeout }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Using local Kubo node
 * 
 * ```typescript
 * import { IpfsClient } from './IpfsClient';
 * 
 * const client = new IpfsClient({
 *   endpointUrl: 'http://127.0.0.1:5001',
 *   mode: 'kubo-api',
 *   defaultMetadata: {
 *     author: 'my-dapp',
 *     version: '1.0.0'
 *   }
 * });
 * 
 * // Publish contract bytecode
 * const bytecode = '0x608060405234801561001057600080fd5b50...';
 * const codeCid = await client.publishContractCode(bytecode, {
 *   compiler: 'solc 0.8.28',
 *   optimization: true
 * });
 * console.log('Contract code published:', codeCid);
 * 
 * // Retrieve contract bytecode
 * const { bytecode: retrieved, metadata } = await client.getContractCode(codeCid);
 * console.log('Retrieved bytecode:', retrieved);
 * console.log('Metadata:', metadata);
 * ```
 */

/**
 * Example 2: Using Infura IPFS
 * 
 * ```typescript
 * const client = new IpfsClient({
 *   endpointUrl: 'https://ipfs.infura.io:5001',
 *   mode: 'kubo-api',
 *   credentials: {
 *     projectId: 'YOUR_INFURA_PROJECT_ID',
 *     projectSecret: 'YOUR_INFURA_PROJECT_SECRET'
 *   }
 * });
 * 
 * // Publish ABI
 * const abi = [
 *   { type: 'function', name: 'transfer', inputs: [...] }
 * ];
 * const abiCid = await client.publishContractData(abi, {
 *   contractName: 'MyToken',
 *   version: '1.0.0'
 * }, 'abi-v1');
 * console.log('ABI published:', abiCid);
 * 
 * // Retrieve ABI
 * const { data, schemaId } = await client.getContractData<typeof abi>(abiCid);
 * console.log('Retrieved ABI:', data);
 * console.log('Schema:', schemaId);
 * ```
 */

/**
 * Example 3: Using Pinata
 * 
 * ```typescript
 * const client = new IpfsClient({
 *   endpointUrl: 'https://api.pinata.cloud',
 *   mode: 'kubo-api',
 *   credentials: {
 *     headers: {
 *       'pinata_api_key': 'YOUR_PINATA_API_KEY',
 *       'pinata_secret_api_key': 'YOUR_PINATA_SECRET_KEY'
 *     }
 *   }
 * });
 * ```
 */

/**
 * Example 4: Publishing deployment information
 * 
 * ```typescript
 * interface DeploymentInfo {
 *   address: string;
 *   network: string;
 *   blockNumber: number;
 *   timestamp: number;
 *   deployer: string;
 * }
 * 
 * const deployInfo: DeploymentInfo = {
 *   address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
 *   network: 'sepolia',
 *   blockNumber: 12345678,
 *   timestamp: Date.now(),
 *   deployer: '0xABC...'
 * };
 * 
 * const cid = await client.publishContractData(
 *   deployInfo,
 *   { deploymentTool: 'hardhat' },
 *   'deployment-v1'
 * );
 * 
 * // Later retrieve it
 * const { data } = await client.getContractData<DeploymentInfo>(cid);
 * console.log('Deployed at:', data.address);
 * ```
 */

/**
 * Example 5: Error handling
 * 
 * ```typescript
 * import { IpfsClient, IpfsError } from './IpfsClient';
 * 
 * try {
 *   const cid = await client.publishContractCode(bytecode);
 * } catch (error) {
 *   if (error instanceof IpfsError) {
 *     console.error('IPFS Error:', error.code);
 *     console.error('Message:', error.message);
 *     console.error('Details:', error.details);
 *   } else {
 *     console.error('Unexpected error:', error);
 *   }
 * }
 * ```
 */

/**
 * Example 6: Custom fetch implementation (Node.js < 18)
 * 
 * ```typescript
 * import fetch from 'node-fetch';
 * 
 * const client = new IpfsClient({
 *   endpointUrl: 'http://127.0.0.1:5001',
 *   mode: 'kubo-api',
 *   fetchImpl: fetch as any
 * });
 * ```
 */
