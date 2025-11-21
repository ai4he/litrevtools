/**
 * Quota Tracker - Intelligent per-key quota tracking and smart rotation
 * Tracks RPM, TPM, RPD independently for each API key
 */

import { APIKeyInfo } from '../types';
import { config } from '../../config';
import { LitRevDatabase } from '../database';
import * as crypto from 'crypto';

// Model quota configurations (from testing 2025-11-19)
export interface ModelQuotas {
  rpm: number;  // Requests per minute
  tpm: number;  // Tokens per minute
  rpd: number;  // Requests per day
}

// Export model quotas from config for use throughout the application
export const MODEL_QUOTAS: Record<string, ModelQuotas> = config.llm.modelQuotas;

export class QuotaTracker {
  private static database: LitRevDatabase | null = null;

  /**
   * Set the database instance for persistent quota tracking
   */
  static setDatabase(db: LitRevDatabase): void {
    this.database = db;
  }

  /**
   * Create a hash of the API key for storage (to avoid storing keys in plaintext)
   */
  private static hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 32);
  }

  /**
   * Initialize quota tracking for a key based on the model
   * Loads from database if available, otherwise creates new tracking
   */
  static initializeQuotaTracking(keyInfo: APIKeyInfo, modelName: string): void {
    let quotas = MODEL_QUOTAS[modelName];
    if (!quotas) {
      console.warn(`Unknown model ${modelName}, using default quotas`);
      // Use lowest quotas as default
      quotas = { rpm: 2, tpm: 125000, rpd: 50 };
    }

    // Try to load from database
    let dbRecord = null;
    if (this.database) {
      const keyHash = this.hashApiKey(keyInfo.key);
      dbRecord = this.database.getOrCreateQuotaRecord(keyHash, modelName, quotas);
    }

    const now = new Date();

    if (dbRecord) {
      // Load from database and check if quotas need reset
      const rpmResetAt = new Date(dbRecord.rpm_reset_at);
      const tpmResetAt = new Date(dbRecord.tpm_reset_at);
      const rpdResetAt = new Date(dbRecord.rpd_reset_at);

      keyInfo.quotaTracking = {
        rpm: {
          limit: dbRecord.rpm_limit,
          used: now >= rpmResetAt ? 0 : dbRecord.rpm_used,
          resetAt: now >= rpmResetAt ? new Date(now.getTime() + 60000) : rpmResetAt
        },
        tpm: {
          limit: dbRecord.tpm_limit,
          used: now >= tpmResetAt ? 0 : dbRecord.tpm_used,
          resetAt: now >= tpmResetAt ? new Date(now.getTime() + 60000) : tpmResetAt
        },
        rpd: {
          limit: dbRecord.rpd_limit,
          used: now >= rpdResetAt ? 0 : dbRecord.rpd_used,
          resetAt: now >= rpdResetAt ? this.getNextMidnightPT() : rpdResetAt
        }
      };

      // Restore status from database
      keyInfo.status = dbRecord.status as any;
    } else {
      // Initialize with fresh quotas (no database available)
      const nextMinute = new Date(now.getTime() + 60000);
      const midnightPT = this.getNextMidnightPT();

      keyInfo.quotaTracking = {
        rpm: {
          limit: quotas.rpm,
          used: 0,
          resetAt: nextMinute
        },
        tpm: {
          limit: quotas.tpm,
          used: 0,
          resetAt: nextMinute
        },
        rpd: {
          limit: quotas.rpd,
          used: 0,
          resetAt: midnightPT
        }
      };
    }

    keyInfo.healthCheck = {
      isHealthy: true,
      lastChecked: undefined,
      lastError: undefined
    };
  }

  /**
   * Update quota tracking when a model changes
   */
  static updateQuotaLimits(keyInfo: APIKeyInfo, modelName: string): void {
    const quotas = MODEL_QUOTAS[modelName];
    if (!quotas || !keyInfo.quotaTracking) return;

    keyInfo.quotaTracking.rpm.limit = quotas.rpm;
    keyInfo.quotaTracking.tpm.limit = quotas.tpm;
    keyInfo.quotaTracking.rpd.limit = quotas.rpd;
  }

  /**
   * Record a request and token usage for a key
   * Updates both in-memory and database
   */
  static recordUsage(keyInfo: APIKeyInfo, tokensUsed: number, modelName?: string): void {
    if (!keyInfo.quotaTracking) return;

    const now = new Date();

    // Reset RPM if minute has passed
    if (now >= keyInfo.quotaTracking.rpm.resetAt) {
      keyInfo.quotaTracking.rpm.used = 0;
      keyInfo.quotaTracking.rpm.resetAt = new Date(now.getTime() + 60000);
    }

    // Reset TPM if minute has passed
    if (now >= keyInfo.quotaTracking.tpm.resetAt) {
      keyInfo.quotaTracking.tpm.used = 0;
      keyInfo.quotaTracking.tpm.resetAt = new Date(now.getTime() + 60000);
    }

    // Reset RPD if day has passed (midnight PT)
    if (now >= keyInfo.quotaTracking.rpd.resetAt) {
      keyInfo.quotaTracking.rpd.used = 0;
      keyInfo.quotaTracking.rpd.resetAt = this.getNextMidnightPT();
    }

    // Increment usage
    keyInfo.quotaTracking.rpm.used += 1;
    keyInfo.quotaTracking.tpm.used += tokensUsed;
    keyInfo.quotaTracking.rpd.used += 1;

    keyInfo.lastUsed = now;
    keyInfo.requestCount += 1;

    // Persist to database
    if (this.database && modelName) {
      const keyHash = this.hashApiKey(keyInfo.key);
      this.database.updateQuotaUsage(keyHash, modelName, tokensUsed);
    }
  }

  /**
   * Check if a key has available quota for a request
   */
  static hasAvailableQuota(keyInfo: APIKeyInfo, estimatedTokens: number = 1000): boolean {
    if (!keyInfo.quotaTracking) return false;
    if (keyInfo.status !== 'active') return false;

    const now = new Date();

    // Auto-reset if time windows have passed
    this.autoResetQuotas(keyInfo, now);

    const { rpm, tpm, rpd } = keyInfo.quotaTracking;

    // Check all three quotas
    const hasRPM = rpm.used < rpm.limit;
    const hasTPM = (tpm.used + estimatedTokens) < tpm.limit;
    const hasRPD = rpd.used < rpd.limit;

    return hasRPM && hasTPM && hasRPD;
  }

  /**
   * Get the percentage of quota remaining (0-100)
   */
  static getQuotaRemaining(keyInfo: APIKeyInfo): number {
    if (!keyInfo.quotaTracking) return 0;

    const { rpm, tpm, rpd } = keyInfo.quotaTracking;

    const rpmRemaining = ((rpm.limit - rpm.used) / rpm.limit) * 100;
    const tpmRemaining = ((tpm.limit - tpm.used) / tpm.limit) * 100;
    const rpdRemaining = ((rpd.limit - rpd.used) / rpd.limit) * 100;

    // Return the minimum (most restrictive quota)
    return Math.min(rpmRemaining, tpmRemaining, rpdRemaining);
  }

  /**
   * Auto-reset quotas if time windows have passed
   */
  private static autoResetQuotas(keyInfo: APIKeyInfo, now: Date): void {
    if (!keyInfo.quotaTracking) return;

    if (now >= keyInfo.quotaTracking.rpm.resetAt) {
      keyInfo.quotaTracking.rpm.used = 0;
      keyInfo.quotaTracking.rpm.resetAt = new Date(now.getTime() + 60000);
    }

    if (now >= keyInfo.quotaTracking.tpm.resetAt) {
      keyInfo.quotaTracking.tpm.used = 0;
      keyInfo.quotaTracking.tpm.resetAt = new Date(now.getTime() + 60000);
    }

    if (now >= keyInfo.quotaTracking.rpd.resetAt) {
      keyInfo.quotaTracking.rpd.used = 0;
      keyInfo.quotaTracking.rpd.resetAt = this.getNextMidnightPT();
    }
  }

  /**
   * Get next midnight Pacific Time
   */
  private static getNextMidnightPT(): Date {
    const now = new Date();

    // Convert to Pacific Time (UTC-8 or UTC-7 depending on DST)
    // For simplicity, use UTC-8 (PST)
    const pacificOffset = -8 * 60; // minutes
    const utcOffset = now.getTimezoneOffset(); // minutes
    const totalOffset = pacificOffset - utcOffset;

    const pacificNow = new Date(now.getTime() + totalOffset * 60000);

    // Get midnight PT
    const midnight = new Date(pacificNow);
    midnight.setHours(0, 0, 0, 0);

    // If it's past midnight, get next midnight
    if (pacificNow >= midnight) {
      midnight.setDate(midnight.getDate() + 1);
    }

    // Convert back to local time
    return new Date(midnight.getTime() - totalOffset * 60000);
  }

  /**
   * Get time until next quota reset (in milliseconds)
   */
  static getTimeUntilReset(keyInfo: APIKeyInfo): { rpm: number; tpm: number; rpd: number } {
    if (!keyInfo.quotaTracking) {
      return { rpm: 0, tpm: 0, rpd: 0 };
    }

    const now = new Date();
    return {
      rpm: Math.max(0, keyInfo.quotaTracking.rpm.resetAt.getTime() - now.getTime()),
      tpm: Math.max(0, keyInfo.quotaTracking.tpm.resetAt.getTime() - now.getTime()),
      rpd: Math.max(0, keyInfo.quotaTracking.rpd.resetAt.getTime() - now.getTime())
    };
  }

  /**
   * Format quota status for logging
   */
  static formatQuotaStatus(keyInfo: APIKeyInfo): string {
    if (!keyInfo.quotaTracking) return 'No quota tracking';

    const { rpm, tpm, rpd } = keyInfo.quotaTracking;
    return `RPM: ${rpm.used}/${rpm.limit}, TPM: ${tpm.used}/${tpm.limit}, RPD: ${rpd.used}/${rpd.limit}`;
  }
}
