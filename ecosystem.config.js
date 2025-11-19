/**
 * PM2 Ecosystem Configuration for LitRevTools
 *
 * This file configures PM2 process management for the LitRevTools web server.
 * It handles automatic restarts, logging, and environment configuration.
 */

module.exports = {
  apps: [
    {
      name: 'litrevtools-web',
      script: './dist/platforms/web/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',

      // Automatic restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PAPER_BATCH_SIZE: '30',
      },

      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Process management
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,

      // Advanced features
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};
