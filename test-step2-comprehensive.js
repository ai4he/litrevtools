#!/usr/bin/env node
/**
 * Comprehensive Step 2 Filtering Test
 * Tests different models and batch sizes
 */

const { LLMService } = require('./dist/core/llm/llm-service');
require('dotenv').config();

// Sample papers for testing
const testPapers = [
  {
    id: 'test1',
    title: 'Machine Learning for Healthcare: A Comprehensive Survey',
    authors: ['Smith, J.'],
    year: 2023,
    abstract: 'This paper surveys the applications of machine learning in healthcare.'
  },
  {
    id: 'test2',
    title: 'Blockchain Technology in Supply Chain Management',
    authors: ['Johnson, B.'],
    year: 2022,
    abstract: 'This study explores how blockchain can improve supply chain transparency.'
  },
  {
    id: 'test3',
    title: 'Deep Learning for Medical Image Analysis',
    authors: ['Lee, C.'],
    year: 2024,
    abstract: 'We propose a deep learning approach for automated detection of anomalies in medical imaging.'
  },
  {
    id: 'test4',
    title: 'Artificial Intelligence in Cancer Diagnosis',
    authors: ['Wang, D.'],
    year: 2023,
    abstract: 'AI-based system for early detection of cancer using patient data and imaging.'
  },
  {
    id: 'test5',
    title: 'Natural Language Processing for Clinical Notes',
    authors: ['Garcia, E.'],
    year: 2024,
    abstract: 'NLP techniques for extracting medical information from electronic health records.'
  }
];

const inclusionCriteria = 'Studies using AI/ML for healthcare applications.';
const exclusionCriteria = 'Surveys or reviews without practical applications.';

async function testWithModel(modelName) {
  console.log();
  console.log('='.repeat(70));
  console.log(`Testing with model: ${modelName}`);
  console.log('='.repeat(70));

  try {
    const apiKeys = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()) || [];

    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: modelName,
      apiKeys: apiKeys,
      batchSize: 5,
      maxConcurrentBatches: 1,
      temperature: 0.3,
      fallbackStrategy: 'fail',
      enableKeyRotation: true
    });

    await llmService.initialize();

    const startTime = Date.now();
    const filteredPapers = await llmService.semanticFilterSeparate(
      testPapers,
      inclusionCriteria,
      exclusionCriteria
    );
    const duration = Date.now() - startTime;

    // Check results
    const hasInclusionData = filteredPapers.filter(p => p.systematic_filtering_inclusion !== undefined).length;
    const hasExclusionData = filteredPapers.filter(p => p.systematic_filtering_exclusion !== undefined).length;
    const errorsFound = filteredPapers.some(p =>
      p.systematic_filtering_inclusion_reasoning?.includes('Unable to evaluate') ||
      p.systematic_filtering_exclusion_reasoning?.includes('Unable to evaluate')
    );

    console.log(`✓ Model: ${modelName}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Papers with Inclusion Data: ${hasInclusionData}/${testPapers.length}`);
    console.log(`  Papers with Exclusion Data: ${hasExclusionData}/${testPapers.length}`);
    console.log(`  Errors: ${errorsFound ? 'YES ⚠' : 'NO ✓'}`);

    return {
      model: modelName,
      success: !errorsFound && hasInclusionData === testPapers.length && hasExclusionData === testPapers.length,
      duration,
      hasInclusionData,
      hasExclusionData,
      errorsFound
    };

  } catch (error) {
    console.log(`✗ Model: ${modelName} - FAILED`);
    console.log(`  Error: ${error.message}`);
    return {
      model: modelName,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('Comprehensive Step 2 Filtering Test');
  console.log('='.repeat(70));
  console.log();
  console.log(`Test Papers: ${testPapers.length}`);
  console.log(`Inclusion Criteria: ${inclusionCriteria}`);
  console.log(`Exclusion Criteria: ${exclusionCriteria}`);

  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];

  const results = [];
  for (const model of modelsToTest) {
    const result = await testWithModel(model);
    results.push(result);
  }

  console.log();
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));

  results.forEach(result => {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} ${result.model}${result.duration ? ` (${result.duration}ms)` : ''}`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });

  const allPassed = results.every(r => r.success);
  console.log();
  if (allPassed) {
    console.log('✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠ Some tests failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
