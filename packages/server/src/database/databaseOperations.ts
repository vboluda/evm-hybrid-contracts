// PostgresDb.ts
import type { Pool, PoolClient } from "pg";
import { PostgresClientManager, type EnvLike } from "./databaseConnection";

/**
 * Base class for DB operations on top of PostgresClientManager.
 *
 * Responsibilities (for later):
 * - Expose convenience helpers (query, tx, etc.)
 * - Group domain repositories / data-access methods
 *
 * For now: only extends the connection manager without adding behavior.
 */
export class databaseOperations extends PostgresClientManager {
  /**
   * Optional convenience re-export: lets callers do db.connect() like before.
   * (No behavior change; just here if you want to keep usage symmetrical.)
   */
  override async connect(env: EnvLike = process.env as unknown as EnvLike): Promise<void> {
    return super.connect(env);
  }

  /**
   * Protected accessors to be used by subclasses / future methods.
   * Keeps Pool/Client access centralized and typed.
   */
  protected getDbPool(): Pool {
    return this.getPool();
  }

  protected async client(): Promise<PoolClient> {
    return this.getClient();
  }


  /**
  * Bootstrap DB schema (incremental + idempotent).
  * Safe to run on every app start.
  */
  async bootstrap(): Promise<void> {
    const c = await this.client();
    try {
      await c.query("BEGIN");

      // 1) Enum type for status (idempotent)
      await c.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offchain_call_status') THEN
    CREATE TYPE offchain_call_status AS ENUM ('registered','running','processed','error');
  END IF;
END$$;
      `.trim());

      // 2) Table (create-if-missing)
      await c.query(`
CREATE TABLE IF NOT EXISTS offchain_calls (
  request_id              CHAR(66) NOT NULL, -- 0x + 64 hex
  caller                  CHAR(42) NOT NULL, -- 0x + 40 hex
  block_number            BIGINT NOT NULL,
  block_timestamp         TIMESTAMPTZ NOT NULL,

  call_data               TEXT NOT NULL,     -- 0x... (variable length)
  bytecode_location       TEXT NOT NULL,
  current_state_location  TEXT NOT NULL,

  status                  offchain_call_status NOT NULL DEFAULT 'registered',
  status_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  output_message          TEXT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
      `.trim());

      console.log('[DB Bootstrap] Enum and base table structure verified');

      // 3) Add new columns for future features (transaction and event tracking)
      await c.query(`
      ALTER TABLE offchain_calls
          ADD COLUMN IF NOT EXISTS transaction_hash CHAR(66);
      `);

      await c.query(`
      ALTER TABLE offchain_calls
          ADD COLUMN IF NOT EXISTS event_hash CHAR(66);
      `);

      console.log('[DB Bootstrap] Additional columns added (transaction_hash, event_hash)');

      // 4) Defaults (safe to repeat)
      await c.query(`ALTER TABLE offchain_calls ALTER COLUMN status SET DEFAULT 'registered';`);
      await c.query(`ALTER TABLE offchain_calls ALTER COLUMN status_updated_at SET DEFAULT NOW();`);
      await c.query(`ALTER TABLE offchain_calls ALTER COLUMN created_at SET DEFAULT NOW();`);
      await c.query(`ALTER TABLE offchain_calls ALTER COLUMN updated_at SET DEFAULT NOW();`);

      console.log('[DB Bootstrap] Column defaults configured');

      // 5) NOT NULLs (only if currently nullable)
      await c.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='request_id' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN request_id SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='caller' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN caller SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='block_number' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN block_number SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='block_timestamp' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN block_timestamp SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='call_data' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN call_data SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='bytecode_location' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN bytecode_location SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='current_state_location' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN current_state_location SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='status' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN status SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='status_updated_at' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN status_updated_at SET NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='offchain_calls' AND column_name='event_hash' AND is_nullable='YES') THEN
    ALTER TABLE offchain_calls ALTER COLUMN event_hash SET NOT NULL;
  END IF;
END$$;
      `.trim());

      console.log('[DB Bootstrap] NOT NULL constraints applied');

      // 6) PK (idempotent)
      await c.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='offchain_calls_pkey') THEN
    ALTER TABLE offchain_calls
      ADD CONSTRAINT offchain_calls_pkey PRIMARY KEY (request_id);
  END IF;
END$$;
      `.trim());

      console.log('[DB Bootstrap] Primary key constraint verified');

      // 7) Format checks (idempotent)
      // - request_id: ^0x[0-9a-fA-F]{64}$
      // - caller:     ^0x[0-9a-fA-F]{40}$
      // - call_data:  ^0x[0-9a-fA-F]*$  (permitimos vacío => "0x")
      await c.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='offchain_calls_request_id_fmt_chk') THEN
    ALTER TABLE offchain_calls
      ADD CONSTRAINT offchain_calls_request_id_fmt_chk
      CHECK (request_id ~ '^0x[0-9a-fA-F]{64}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='offchain_calls_caller_fmt_chk') THEN
    ALTER TABLE offchain_calls
      ADD CONSTRAINT offchain_calls_caller_fmt_chk
      CHECK (caller ~ '^0x[0-9a-fA-F]{40}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='offchain_calls_call_data_fmt_chk') THEN
    ALTER TABLE offchain_calls
      ADD CONSTRAINT offchain_calls_call_data_fmt_chk
      CHECK (call_data ~ '^0x[0-9a-fA-F]*$');
  END IF;
END$$;
      `.trim());

      console.log('[DB Bootstrap] Format validation constraints verified');

      // 8) Indexes (idempotent)
      await c.query(`CREATE INDEX IF NOT EXISTS offchain_calls_status_idx ON offchain_calls(status);`);
      await c.query(`CREATE INDEX IF NOT EXISTS offchain_calls_block_number_idx ON offchain_calls(block_number);`);
      await c.query(`CREATE INDEX IF NOT EXISTS offchain_calls_block_timestamp_idx ON offchain_calls(block_timestamp);`);
      await c.query(`CREATE INDEX IF NOT EXISTS offchain_calls_caller_idx ON offchain_calls(caller);`);
      await c.query(`CREATE INDEX IF NOT EXISTS offchain_calls_created_at_idx ON offchain_calls(created_at);`);

      console.log('[DB Bootstrap] Performance indexes created');

      // 9) Unique index for event_hash (ensures no duplicate events)
      await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS offchain_calls_event_hash_uniq
      ON offchain_calls(event_hash);
      `);

      console.log('[DB Bootstrap] Unique constraints verified');

      await c.query("COMMIT");
      console.log('[DB Bootstrap] Schema bootstrap completed successfully');
    } catch (e) {
      console.error('[DB Bootstrap] Error during schema setup, rolling back:', e);
      try { await c.query("ROLLBACK"); } catch (rbErr) {
        console.error('[DB Bootstrap] Rollback failed:', rbErr);
      }
      throw e;
    } finally {
      c.release();
    }
  }
}
