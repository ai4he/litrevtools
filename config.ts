/**
 * LitRevTools Project Configuration
 *
 * This file contains non-sensitive configuration that is shared across
 * all platforms (CLI, Web, Desktop, Mobile).
 *
 * Sensitive credentials (API keys, OAuth secrets) should be stored in .env
 */

export const config = {
  /**
   * LLM Configuration
   */
  llm: {
    // Default model for Gemini API
    // Options: 'auto', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash-exp'
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',

    // Number of papers to process per batch during iterative paper generation
    paperBatchSize: parseInt(process.env.PAPER_BATCH_SIZE || '15', 10),

    // Maximum parallel requests for LLM processing
    maxParallelRequests: parseInt(process.env.MAX_PARALLEL_REQUESTS || '3', 10),
  },

  /**
   * Database Configuration
   */
  database: {
    // Path to SQLite database file
    path: process.env.DATABASE_PATH || './data/litrevtools.db',
  },

  /**
   * Output Configuration
   */
  output: {
    // Directory for generated output files
    dir: process.env.OUTPUT_DIR || './data/outputs',

    // Enable/disable screenshot capture during extraction
    screenshotEnabled: process.env.SCREENSHOT_ENABLED !== 'false',
  },

  /**
   * Web Server Configuration
   */
  web: {
    // Port for web server
    port: parseInt(process.env.WEB_PORT || '3000', 10),

    // Host for web server
    host: process.env.WEB_HOST || 'localhost',

    // Base URL for the application (used for OAuth callbacks, etc.)
    baseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',
  },

  /**
   * Search Configuration
   */
  search: {
    // Default batch size for semantic filtering
    defaultBatchSize: 20,

    // Default maximum concurrent batches
    defaultMaxConcurrentBatches: 5,

    // Default timeout for LLM requests (ms)
    defaultTimeout: 30000,

    // Default retry attempts
    defaultRetryAttempts: 3,

    // Default temperature for LLM
    defaultTemperature: 0.3,
  },
};

export default config;
