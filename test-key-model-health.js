require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Models to test (from config)
const MODELS_TO_TEST = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash',
  'gemini-2.0-flash-thinking-exp-1219',
  'gemini-exp-1206',
  'gemini-2.0-flash-thinking-exp'
];

const TEST_PROMPT = 'Say "OK" in one word.';

async function testKeyModelCombination(keyIndex, apiKey, modelName) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: TEST_PROMPT }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 10,
      },
    });

    const response = result.response;
    const text = response.text();

    return {
      keyIndex,
      modelName,
      status: 'healthy',
      response: text.trim()
    };
  } catch (error) {
    const errorMessage = error.message || error.toString();

    // Categorize error
    let errorType = 'unknown';
    if (errorMessage.toLowerCase().includes('api key not valid') ||
        errorMessage.toLowerCase().includes('invalid') && errorMessage.toLowerCase().includes('api key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('401')) {
      errorType = 'invalid_key';
    } else if (errorMessage.toLowerCase().includes('rate limit') ||
               errorMessage.toLowerCase().includes('429') ||
               errorMessage.toLowerCase().includes('resource has been exhausted')) {
      errorType = 'rate_limited';
    } else if (errorMessage.toLowerCase().includes('quota') && errorMessage.toLowerCase().includes('exceeded')) {
      errorType = 'quota_exceeded';
    } else if (errorMessage.toLowerCase().includes('not found') ||
               errorMessage.toLowerCase().includes('404') ||
               errorMessage.toLowerCase().includes('model') && errorMessage.toLowerCase().includes('does not exist')) {
      errorType = 'model_not_found';
    } else if (errorMessage.toLowerCase().includes('model') && errorMessage.toLowerCase().includes('not support')) {
      errorType = 'model_not_supported';
    }

    return {
      keyIndex,
      modelName,
      status: 'failed',
      errorType,
      errorMessage: errorMessage.substring(0, 100)
    };
  }
}

async function runHealthCheck() {
  console.log('\n🔍 COMPREHENSIVE API KEY + MODEL HEALTH CHECK\n');
  console.log('='.repeat(100));

  const geminiKeys = process.env.GEMINI_API_KEYS?.split(',').filter(k => k.trim()) || [];

  if (geminiKeys.length === 0) {
    console.log('\n❌ No API keys found in GEMINI_API_KEYS environment variable\n');
    return;
  }

  console.log(`\n📋 Test Configuration:`);
  console.log(`   Total API Keys: ${geminiKeys.length}`);
  console.log(`   Models to Test: ${MODELS_TO_TEST.length}`);
  console.log(`   Total Combinations: ${geminiKeys.length * MODELS_TO_TEST.length}`);
  console.log(`   Test Prompt: "${TEST_PROMPT}"\n`);

  console.log('⏳ Testing all combinations (this may take a few minutes)...\n');

  const results = [];
  let completedTests = 0;
  const totalTests = geminiKeys.length * MODELS_TO_TEST.length;

  // Test each key with each model
  for (let keyIndex = 0; keyIndex < geminiKeys.length; keyIndex++) {
    const apiKey = geminiKeys[keyIndex].trim();

    for (const modelName of MODELS_TO_TEST) {
      const result = await testKeyModelCombination(keyIndex + 1, apiKey, modelName);
      results.push(result);

      completedTests++;

      // Progress indicator every 10 tests
      if (completedTests % 10 === 0 || completedTests === totalTests) {
        process.stdout.write(`\r   Progress: ${completedTests}/${totalTests} tests completed (${Math.round(completedTests/totalTests*100)}%)`);
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n\n');
  console.log('='.repeat(100));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(100));

  // Analyze results
  const healthyResults = results.filter(r => r.status === 'healthy');
  const failedResults = results.filter(r => r.status === 'failed');

  // Group by error type
  const errorsByType = {};
  failedResults.forEach(r => {
    if (!errorsByType[r.errorType]) {
      errorsByType[r.errorType] = [];
    }
    errorsByType[r.errorType].push(r);
  });

  // Summary statistics
  console.log(`\n✅ HEALTHY COMBINATIONS: ${healthyResults.length}/${totalTests} (${Math.round(healthyResults.length/totalTests*100)}%)`);
  console.log(`❌ FAILED COMBINATIONS: ${failedResults.length}/${totalTests} (${Math.round(failedResults.length/totalTests*100)}%)\n`);

  // Healthy combinations by model
  if (healthyResults.length > 0) {
    console.log('='.repeat(100));
    console.log('✅ HEALTHY KEY + MODEL COMBINATIONS');
    console.log('='.repeat(100));

    MODELS_TO_TEST.forEach(model => {
      const healthyForModel = healthyResults.filter(r => r.modelName === model);

      console.log(`\n📦 ${model}`);
      console.log('-'.repeat(100));

      if (healthyForModel.length === 0) {
        console.log('   ❌ No healthy keys for this model');
      } else {
        console.log(`   ✅ ${healthyForModel.length} healthy keys:`);

        // Group into ranges for compact display
        const keyIndices = healthyForModel.map(r => r.keyIndex).sort((a, b) => a - b);
        const ranges = [];
        let rangeStart = keyIndices[0];
        let rangeEnd = keyIndices[0];

        for (let i = 1; i < keyIndices.length; i++) {
          if (keyIndices[i] === rangeEnd + 1) {
            rangeEnd = keyIndices[i];
          } else {
            ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
            rangeStart = keyIndices[i];
            rangeEnd = keyIndices[i];
          }
        }
        ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);

        console.log(`   Keys: ${ranges.join(', ')}`);
      }
    });
  }

  // Failed combinations summary
  if (failedResults.length > 0) {
    console.log('\n\n' + '='.repeat(100));
    console.log('❌ FAILED COMBINATIONS BY ERROR TYPE');
    console.log('='.repeat(100));

    Object.keys(errorsByType).forEach(errorType => {
      const errors = errorsByType[errorType];
      console.log(`\n🔴 ${errorType.toUpperCase().replace(/_/g, ' ')}: ${errors.length} failures`);

      // Group by model for this error type
      const byModel = {};
      errors.forEach(e => {
        if (!byModel[e.modelName]) byModel[e.modelName] = [];
        byModel[e.modelName].push(e.keyIndex);
      });

      Object.keys(byModel).forEach(model => {
        console.log(`   ${model}: Keys ${byModel[model].sort((a, b) => a - b).join(', ')}`);
      });

      // Show sample error message
      console.log(`   Sample error: ${errors[0].errorMessage}`);
    });
  }

  // Detailed list - ALL healthy combinations
  console.log('\n\n' + '='.repeat(100));
  console.log('📋 COMPLETE LIST OF HEALTHY COMBINATIONS');
  console.log('='.repeat(100));

  if (healthyResults.length === 0) {
    console.log('\n❌ No healthy combinations found!\n');
  } else {
    console.log();
    healthyResults.forEach((r, idx) => {
      console.log(`${(idx + 1).toString().padStart(4)}. Key ${r.keyIndex.toString().padStart(2)} + ${r.modelName.padEnd(40)} → ✅ "${r.response}"`);
    });
  }

  console.log('\n' + '='.repeat(100) + '\n');

  // Key-by-key summary
  console.log('='.repeat(100));
  console.log('🔑 PER-KEY HEALTH SUMMARY');
  console.log('='.repeat(100));

  for (let i = 1; i <= geminiKeys.length; i++) {
    const keyResults = results.filter(r => r.keyIndex === i);
    const healthy = keyResults.filter(r => r.status === 'healthy');
    const failed = keyResults.filter(r => r.status === 'failed');

    const healthyModels = healthy.map(r => r.modelName);
    const status = healthy.length === MODELS_TO_TEST.length ? '✅ ALL MODELS' :
                   healthy.length > 0 ? `⚠️  ${healthy.length}/${MODELS_TO_TEST.length} MODELS` :
                   '❌ NO MODELS';

    console.log(`\nKey ${i.toString().padStart(2)}: ${status}`);
    if (healthy.length > 0) {
      console.log(`   Healthy: ${healthyModels.join(', ')}`);
    }
    if (failed.length > 0 && failed.length < MODELS_TO_TEST.length) {
      const failedModels = failed.map(r => `${r.modelName} (${r.errorType})`);
      console.log(`   Failed:  ${failedModels.join(', ')}`);
    }
  }

  console.log('\n' + '='.repeat(100) + '\n');
}

runHealthCheck().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
