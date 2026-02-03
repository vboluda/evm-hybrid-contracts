// index.ts
import { databaseOperations } from "./database";

/**
 * Application entry point.
 *
 * Responsibilities:
 * - Initialize infrastructure dependencies
 * - Establish database connection
 * - Handle graceful shutdown
 *
 * Domain bootstrap and event handling will be added later.
 */
async function main(): Promise<void> {
  const db = new databaseOperations();

  try {
    await db.connect();
    console.log("✅ PostgreSQL connection established");

    // TODO:
    // await bootstrapDatabase(db);
    // await startEventProcessing(db);

  } catch (error) {
    console.error("❌ Application startup failed", error);
    process.exit(1);
  }

  /**
   * Graceful shutdown handler.
   */
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`🛑 Received ${signal}. Shutting down...`);
    try {
      await db.disconnect();
      console.log("✅ PostgreSQL connection closed");
    } catch (err) {
      console.error("⚠️ Error while closing PostgreSQL connection", err);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", async (err) => {
    console.error("💥 Uncaught exception", err);
    await shutdown("uncaughtException");
  });
  process.on("unhandledRejection", async (reason) => {
    console.error("💥 Unhandled promise rejection", reason);
    await shutdown("unhandledRejection");
  });


  // Database bootstrap
  try {
    await db.bootstrap();
    console.log("✅ Database schema bootstrap completed");
    await db.insertOffchainCall(
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde6', // requestId
      '0x2bf1BBFa2BBC07e47290385936AB27a0c697fB5B', // caller (address)
      '0x1234567890123456789012345678901234567890', // sender (address)
      12345n, // block (from event)
      '0xFABADACAFEAAAAAAAAAAAAAAAAAAAAAAAAAAaa', // call (bytes - call data)
      'ipfs://QmExampleBytecodeHash123456789', // bytecodeLocation
      'ipfs://QmExampleStateHash123456789ABC', // currentStateLocation
      1n, // nonce (uint256)
      12345678n, // blockNumber (actual block number)
      1737820800n, // blockTimestamp (unix timestamp en segundos)
      '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321' // txHash
    );
    console.log("✅ Sample offchain call inserted");
    const allCalls = await db.getAllOffchainCalls();
    console.log("📋 All offchain calls:", allCalls);
  } catch (err) {
    console.error("❌ Database schema bootstrap failed", err);
    process.exit(1);
  }
}


// Execute application
main().catch((err) => {
  console.error("💥 Fatal error during startup", err);
  process.exit(1);
});
