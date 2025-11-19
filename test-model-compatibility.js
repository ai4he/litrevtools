#!/usr/bin/env node
/**
 * Test all API keys with all Gemini models to determine compatibility
 * and create a quota-based fallback strategy
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

// Models sorted by free tier quota (highest to lowest)
// Updated 2025-11-19 - Removed invalid models and Vertex AI-only models
// NOTE: gemini-3-pro-preview-11-2025 is only available on Vertex AI (paid), not free tier
const MODELS_TO_TEST = [
  { name: 'gemini-2.0-flash-lite', rpm: 30, tpm: 1000000, rpd: 200 },
  { name: 'gemini-2.5-flash-lite', rpm: 15, tpm: 250000, rpd: 1000 },
  { name: 'gemini-2.0-flash', rpm: 15, tpm: 1000000, rpd: 200 },
  { name: 'gemini-2.5-flash', rpm: 10, tpm: 250000, rpd: 250 },
  { name: 'gemini-2.5-pro', rpm: 2, tpm: 125000, rpd: 50 },
];

// Get API keys from environment
const API_KEYS = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim())
  : [];

if (API_KEYS.length === 0) {
  console.error('No API keys found in GEMINI_API_KEYS environment variable');
  process.exit(1);
}

console.log(`\n${'='.repeat(80)}`);
console.log('GEMINI MODEL COMPATIBILITY TEST');
console.log(`${'='.repeat(80)}\n`);
console.log(`Testing ${API_KEYS.length} API keys with ${MODELS_TO_TEST.length} models\n`);

// Simple test prompt
const TEST_PROMPT = `You are a research assistant. Respond with ONLY this JSON:
{
  "status": "ok",
  "message": "Model is working correctly"
}`;

// Results storage
const results = [];

// Test a single API key with a single model
async function testKeyWithModel(keyIndex, apiKey, model) {
  const keyLabel = `Key ${keyIndex + 1}`;
  const maskedKey = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model: model.name });

    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: TEST_PROMPT }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 100,
      },
    });

    const response = result.response;
    const text = response.text();

    return {
      keyIndex,
      keyLabel,
      maskedKey,
      modelName: model.name,
      rpm: model.rpm,
      tpm: model.tpm,
      rpd: model.rpd,
      success: true,
      response: text.substring(0, 50),
      error: null
    };
  } catch (error) {
    const errorMessage = error.message || error.toString();
    const errorType = classifyError(errorMessage);

    return {
      keyIndex,
      keyLabel,
      maskedKey,
      modelName: model.name,
      rpm: model.rpm,
      tpm: model.tpm,
      rpd: model.rpd,
      success: false,
      response: null,
      error: errorMessage.substring(0, 100),
      errorType
    };
  }
}

// Classify error type for debugging
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

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all tests
async function runTests() {
  const startTime = Date.now();
  let testsCompleted = 0;
  const totalTests = API_KEYS.length * MODELS_TO_TEST.length;

  // Test each key with each model
  for (let keyIndex = 0; keyIndex < API_KEYS.length; keyIndex++) {
    const apiKey = API_KEYS[keyIndex];
    console.log(`\nTesting Key ${keyIndex + 1}/${API_KEYS.length}...`);

    for (const model of MODELS_TO_TEST) {
      process.stdout.write(`  ${model.name.padEnd(40)} ... `);

      const result = await testKeyWithModel(keyIndex, apiKey, model);
      results.push(result);
      testsCompleted++;

      if (result.success) {
        console.log('✓ SUCCESS');
      } else {
        console.log(`✗ FAILED (${result.errorType})`);
      }

      // Wait 2 seconds between tests to avoid rate limits
      if (testsCompleted < totalTests) {
        await delay(2000);
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Tests completed in ${duration} seconds`);
  console.log(`${'='.repeat(80)}\n`);

  return results;
}

// Generate summary report
function generateReport(results) {
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY REPORT');
  console.log('='.repeat(80) + '\n');

  // Success rate by model
  console.log('SUCCESS RATE BY MODEL:\n');
  const modelStats = {};

  for (const model of MODELS_TO_TEST) {
    const modelResults = results.filter(r => r.modelName === model.name);
    const successCount = modelResults.filter(r => r.success).length;
    const total = modelResults.length;
    const successRate = ((successCount / total) * 100).toFixed(1);

    modelStats[model.name] = {
      success: successCount,
      total,
      rate: successRate,
      rpm: model.rpm,
      tpm: model.tpm,
      rpd: model.rpd
    };

    console.log(`  ${model.name.padEnd(45)} ${successCount}/${total} (${successRate}%) | RPM: ${model.rpm.toString().padStart(3)} | RPD: ${model.rpd.toString().padStart(5)}`);
  }

  // Success rate by key
  console.log('\n\nSUCCESS RATE BY API KEY:\n');
  const keyStats = {};

  for (let i = 0; i < API_KEYS.length; i++) {
    const keyResults = results.filter(r => r.keyIndex === i);
    const successCount = keyResults.filter(r => r.success).length;
    const total = keyResults.length;
    const successRate = ((successCount / total) * 100).toFixed(1);
    const maskedKey = keyResults[0].maskedKey;

    keyStats[`Key ${i + 1}`] = {
      success: successCount,
      total,
      rate: successRate,
      maskedKey
    };

    console.log(`  Key ${(i + 1).toString().padStart(2)}: ${maskedKey.padEnd(20)} ${successCount}/${total} (${successRate}%)`);
  }

  // Error breakdown
  console.log('\n\nERROR BREAKDOWN:\n');
  const errors = results.filter(r => !r.success);
  const errorTypes = {};

  for (const error of errors) {
    errorTypes[error.errorType] = (errorTypes[error.errorType] || 0) + 1;
  }

  for (const [type, count] of Object.entries(errorTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }

  // Working combinations table
  console.log('\n\nWORKING COMBINATIONS:\n');
  console.log('Model Name'.padEnd(45) + ' | ' + 'Working Keys'.padEnd(30) + ' | RPM | TPM       | RPD');
  console.log('-'.repeat(110));

  for (const model of MODELS_TO_TEST) {
    const workingKeys = results
      .filter(r => r.modelName === model.name && r.success)
      .map(r => r.keyLabel)
      .join(', ');

    if (workingKeys.length > 0) {
      console.log(
        model.name.padEnd(45) + ' | ' +
        workingKeys.padEnd(30) + ' | ' +
        model.rpm.toString().padStart(3) + ' | ' +
        model.tpm.toString().padStart(9) + ' | ' +
        model.rpd.toString().padStart(3)
      );
    }
  }

  // Recommended strategy
  console.log('\n\nRECOMMENDED FALLBACK STRATEGY:\n');
  const workingModels = MODELS_TO_TEST.filter(model => {
    const hasWorkingKey = results.some(r => r.modelName === model.name && r.success);
    return hasWorkingKey;
  });

  if (workingModels.length > 0) {
    console.log('Use models in this order for maximum quota:\n');
    workingModels.forEach((model, i) => {
      const workingKeyCount = results.filter(r => r.modelName === model.name && r.success).length;
      console.log(`  ${i + 1}. ${model.name.padEnd(45)} (${workingKeyCount} keys, RPM: ${model.rpm}, RPD: ${model.rpd})`);
    });
  } else {
    console.log('  ⚠ No working model/key combinations found!');
  }

  console.log('\n' + '='.repeat(80) + '\n');

  return {
    modelStats,
    keyStats,
    errorTypes,
    workingModels
  };
}

// Save results to JSON
function saveResults(results, summary) {
  const output = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    successfulTests: results.filter(r => r.success).length,
    failedTests: results.filter(r => !r.success).length,
    summary,
    detailedResults: results
  };

  const filename = 'model-compatibility-test-results.json';
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`Detailed results saved to: ${filename}\n`);
}

// Main execution
async function main() {
  try {
    const results = await runTests();
    const summary = generateReport(results);
    saveResults(results, summary);
  } catch (error) {
    console.error('\nFatal error during testing:', error);
    process.exit(1);
  }
}

main();
