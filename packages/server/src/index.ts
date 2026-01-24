// index.ts
import { PostgresClientManager } from "./database";

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
  const db = new PostgresClientManager();

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
}

// Execute application
main().catch((err) => {
  console.error("💥 Fatal error during startup", err);
  process.exit(1);
});
