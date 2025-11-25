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

    // Model quotas: RPM (Requests Per Minute), TPM (Tokens Per Minute), RPD (Requests Per Day)
    // Update these values based on your Gemini API tier or if Google updates quotas
    modelQuotas: {
      'gemini-3-pro-preview': { rpm: 5, tpm: 250000, rpd: 100 },  // Gemini 3 Pro (Preview)
      'gemini-2.0-flash-lite': { rpm: 30, tpm: 1000000, rpd: 200 },
      'gemini-2.5-flash-lite': { rpm: 15, tpm: 250000, rpd: 1000 },
      'gemini-2.0-flash': { rpm: 15, tpm: 1000000, rpd: 200 },
      'gemini-2.5-flash': { rpm: 10, tpm: 250000, rpd: 250 },
      'gemini-2.5-pro': { rpm: 2, tpm: 125000, rpd: 50 },
    },

    // Model priority orders for different use cases
    // When "auto" mode is selected, these arrays define the order of models to try
    modelPriorityOrders: {
      // For Step 2: Semantic filtering (prioritize speed and throughput)
      semanticFiltering: [
        'gemini-2.0-flash-lite',   // Fastest: RPM: 30, TPM: 1M, RPD: 200
        'gemini-2.5-flash-lite',   // High quota: RPM: 15, TPM: 250K, RPD: 1000
        'gemini-2.0-flash',        // Fast: RPM: 15, TPM: 1M, RPD: 200
        'gemini-2.5-flash',        // Balanced: RPM: 10, TPM: 250K, RPD: 250
        'gemini-2.5-pro',          // Fallback: RPM: 2, TPM: 125K, RPD: 50
      ],

      // For Step 3: LaTeX generation (prioritize quality and intelligence)
      latexGeneration: [
        'gemini-3-pro-preview',    // Best: Gemini 3 Pro (Preview) - Top quality
        'gemini-2.5-pro',          // Smartest 2.x: RPM: 2, TPM: 125K, RPD: 50
        'gemini-2.5-flash',        // Good balance: RPM: 10, TPM: 250K, RPD: 250
        'gemini-2.0-flash',        // Fast but capable: RPM: 15, TPM: 1M, RPD: 200
        'gemini-2.5-flash-lite',   // High quota: RPM: 15, TPM: 250K, RPD: 1000
        'gemini-2.0-flash-lite',   // Fastest fallback: RPM: 30, TPM: 1M, RPD: 200
      ],

      // For LaTeX verification (prioritize quality)
      latexVerification: [
        'gemini-3-pro-preview',    // Best: Gemini 3 Pro (Preview) - Top quality
        'gemini-2.5-pro',          // Smartest 2.x: RPM: 2, TPM: 125K, RPD: 50
        'gemini-2.5-flash',        // Good balance: RPM: 10, TPM: 250K, RPD: 250
        'gemini-2.0-flash',        // Fast but capable: RPM: 15, TPM: 1M, RPD: 200
        'gemini-2.5-flash-lite',   // High quota: RPM: 15, TPM: 250K, RPD: 1000
        'gemini-2.0-flash-lite',   // Fastest fallback: RPM: 30, TPM: 1M, RPD: 200
      ],
    },
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
