#!/usr/bin/env node
/**
 * Lightweight API Key Health Check
 * Tests each key individually with a single low-quota model to identify healthy keys
 * Uses minimal requests to avoid consuming quota
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Use lowest quota model for testing to minimize impact
const TEST_MODEL = 'gemini-2.5-pro'; // RPM: 2, RPD: 50 (lowest quotas)

// Get API keys from environment
const API_KEYS = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim())
  : [];

if (API_KEYS.length === 0) {
  console.error('No API keys found in GEMINI_API_KEYS environment variable');
  process.exit(1);
}

// Simple test prompt (minimal tokens to reduce quota usage)
const TEST_PROMPT = 'Reply with only: OK';

// Test a single API key
async function testKey(keyIndex, apiKey) {
  const keyLabel = `Key ${keyIndex + 1}`;
  const maskedKey = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: TEST_MODEL });

    const startTime = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: TEST_PROMPT }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 10,
      },
    });

    const duration = Date.now() - startTime;
    const response = result.response;
    const text = response.text();

    return {
      keyIndex,
      keyLabel,
      maskedKey,
      healthy: true,
      responseTime: duration,
      error: null
    };
  } catch (error) {
    const errorMessage = error.message || error.toString();
    const errorType = classifyError(errorMessage);

    return {
      keyIndex,
      keyLabel,
      maskedKey,
      healthy: false,
      responseTime: null,
      error: errorMessage.substring(0, 100),
      errorType
    };
  }
}

// Classify error type
function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('invalid') || msg.includes('not found') || msg.includes('404')) {
    return 'INVALID_MODEL';
  } else if (msg.includes('rate limit') || msg.includes('429') || msg.includes('resource has been exhausted')) {
    return 'RATE_LIMIT';
  } else if (msg.includes('quota') && msg.includes('exceeded')) {
    return 'QUOTA_EXCEEDED';
  } else if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403') || msg.includes('api key')) {
    return 'AUTH_ERROR';
  } else if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused')) {
    return 'NETWORK_ERROR';
  } else {
    return 'UNKNOWN';
  }
}

// Run health check
async function runHealthCheck() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('GEMINI API KEY HEALTH CHECK');
  console.log(`${'='.repeat(80)}\n`);
  console.log(`Testing ${API_KEYS.length} API keys with ${TEST_MODEL} (low quota impact)\n`);

  const results = [];

  // Test keys sequentially with 2-second delays to avoid rate limits
  for (let i = 0; i < API_KEYS.length; i++) {
    const apiKey = API_KEYS[i];
    process.stdout.write(`Testing Key ${i + 1}/${API_KEYS.length} ... `);

    const result = await testKey(i, apiKey);
    results.push(result);

    if (result.healthy) {
      console.log(`✓ HEALTHY (${result.responseTime}ms)`);
    } else {
      console.log(`✗ ${result.errorType}`);
    }

    // Wait 2 seconds between tests to avoid rate limits
    if (i < API_KEYS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  const healthyKeys = results.filter(r => r.healthy);
  const unhealthyKeys = results.filter(r => !r.healthy);

  console.log(`Total Keys: ${API_KEYS.length}`);
  console.log(`Healthy Keys: ${healthyKeys.length} (${((healthyKeys.length / API_KEYS.length) * 100).toFixed(1)}%)`);
  console.log(`Unhealthy Keys: ${unhealthyKeys.length}\n`);

  if (healthyKeys.length > 0) {
    console.log('HEALTHY KEYS:\n');
    healthyKeys.forEach(r => {
      console.log(`  ${r.keyLabel.padStart(7)}: ${r.maskedKey} (${r.responseTime}ms)`);
    });
    console.log(`\nHealthy key numbers: ${healthyKeys.map(r => r.keyIndex + 1).join(', ')}\n`);
  }

  if (unhealthyKeys.length > 0) {
    console.log('UNHEALTHY KEYS:\n');

    // Group by error type
    const errorGroups = {};
    unhealthyKeys.forEach(r => {
      if (!errorGroups[r.errorType]) {
        errorGroups[r.errorType] = [];
      }
      errorGroups[r.errorType].push(r);
    });

    for (const [errorType, keys] of Object.entries(errorGroups)) {
      console.log(`  ${errorType} (${keys.length} keys):`);
      keys.forEach(r => {
        console.log(`    ${r.keyLabel}: ${r.maskedKey}`);
      });
      console.log();
    }
  }

  // Save results to JSON
  const output = {
    timestamp: new Date().toISOString(),
    totalKeys: API_KEYS.length,
    healthyKeys: healthyKeys.length,
    unhealthyKeys: unhealthyKeys.length,
    testModel: TEST_MODEL,
    results: results.map(r => ({
      keyNumber: r.keyIndex + 1,
      maskedKey: r.maskedKey,
      healthy: r.healthy,
      responseTime: r.responseTime,
      errorType: r.errorType
    }))
  };

  const fs = require('fs');
  fs.writeFileSync('key-health-check.json', JSON.stringify(output, null, 2));
  console.log(`Detailed results saved to: key-health-check.json\n`);

  console.log(`${'='.repeat(80)}\n`);
}

// Run the health check
runHealthCheck().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
