// PostgresClient.ts
import { Pool, PoolClient, PoolConfig } from "pg";

/**
 * A minimal shape for environment variables.
 * Node's process.env is compatible with this type.
 */
export type EnvLike = Record<string, string | undefined>;

/**
 * Manages PostgreSQL connections using a connection pool.
 *
 * Responsibilities:
 * - Initialize and validate the database connection
 * - Expose pooled connections to the application
 * - Gracefully close connections on shutdown
 *
 * This class is intentionally minimal.
 * Schema creation, migrations and domain logic will be added later.
 */
export class PostgresClientManager {
  private pool: Pool | null = null;

  /**
   * Initializes the PostgreSQL connection pool and validates connectivity.
   *
   * This method is idempotent:
   * calling it multiple times will not recreate the pool.
   *
   * @param env - Environment variables source (defaults to process.env)
   * @returns Promise<void> - Resolves when the connection is successfully validated
   * @throws Error - If the connection cannot be established
   */
  async connect(env: EnvLike = process.env as unknown as EnvLike): Promise<void> {
    if (this.pool) return;

    const config = this.buildConfig(env);
    this.pool = new Pool(config);

    // Smoke test: acquire and release a client to verify connectivity
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1;");
    } finally {
      client.release();
    }
  }

  /**
   * Returns the active PostgreSQL connection pool.
   *
   * @returns Pool - The initialized PostgreSQL connection pool
   * @throws Error - If connect() has not been called yet
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error("Postgres pool not initialized. Call connect() first.");
    }
    return this.pool;
  }

  /**
   * Acquires a client from the pool.
   *
   * Intended use cases:
   * - Transactions
   * - Batch operations
   * - Explicit connection lifecycle control
   *
   * @returns Promise<PoolClient> - A PostgreSQL client from the pool
   * @throws Error - If connect() has not been called yet
   */
  async getClient(): Promise<PoolClient> {
    return this.getPool().connect();
  }

  /**
   * Gracefully shuts down the connection pool.
   *
   * Once called, the manager can be reconnected
   * by invoking connect() again.
   *
   * @returns Promise<void> - Resolves when all connections are closed
   */
  async disconnect(): Promise<void> {
    if (!this.pool) return;

    const activePool = this.pool;
    this.pool = null;

    await activePool.end();
  }

  /**
   * Builds the PostgreSQL pool configuration.
   *
   * Priority order:
   * 1. DATABASE_URL (if provided)
   * 2. Individual PG* environment variables
   * 3. Hardcoded defaults (Docker Compose values)
   *
   * @param env - Environment variables source
   * @returns PoolConfig - PostgreSQL pool configuration
   * @throws Error - If environment variables are invalid
   */
  private buildConfig(env: EnvLike): PoolConfig {
    const defaults = {
      host: "localhost",
      port: 5432,
      user: "OCEV",
      password: "OCEVPass",
      database: "OCEVDatabase",
    };

    const get = (key: string): string | undefined => env[key];

    const ssl =
      (get("PGSSL") ?? "").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : undefined;

    const databaseUrl = get("DATABASE_URL");
    if (databaseUrl && databaseUrl.trim().length > 0) {
      return {
        connectionString: databaseUrl,
        ssl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      };
    }

    const portRaw = get("PGPORT");
    const port = Number(portRaw ?? defaults.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid PGPORT value: "${portRaw}"`);
    }

    return {
      host: get("PGHOST") ?? defaults.host,
      port,
      user: get("PGUSER") ?? defaults.user,
      password: get("PGPASSWORD") ?? defaults.password,
      database: get("PGDATABASE") ?? defaults.database,
      ssl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };
  }
}
