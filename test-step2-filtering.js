#!/usr/bin/env node
/**
 * Test Step 2 Filtering with a small batch
 * This script tests the LLM-based semantic filtering with a single batch
 */

const { LLMService } = require('./dist/core/llm/llm-service');

// Load environment variables
require('dotenv').config();

// Sample papers for testing
const testPapers = [
  {
    id: 'test1',
    title: 'Machine Learning for Healthcare: A Comprehensive Survey',
    authors: ['Smith, J.', 'Doe, A.'],
    year: 2023,
    abstract: 'This paper surveys the applications of machine learning in healthcare, including diagnosis, treatment planning, and patient monitoring.',
    venue: 'Journal of Medical AI'
  },
  {
    id: 'test2',
    title: 'Blockchain Technology in Supply Chain Management',
    authors: ['Johnson, B.'],
    year: 2022,
    abstract: 'This study explores how blockchain can improve supply chain transparency and traceability in manufacturing.',
    venue: 'International Journal of Logistics'
  },
  {
    id: 'test3',
    title: 'Deep Learning for Medical Image Analysis',
    authors: ['Lee, C.', 'Wang, D.'],
    year: 2024,
    abstract: 'We propose a deep learning approach for automated detection of anomalies in medical imaging, with applications in radiology.',
    venue: 'Medical Imaging Conference'
  }
];

// Test criteria
const inclusionCriteria = 'Studies that use artificial intelligence or machine learning for healthcare applications, including diagnosis, treatment, or medical imaging.';
const exclusionCriteria = 'Studies that are surveys, reviews, or purely theoretical without practical healthcare applications.';

async function testStep2Filtering() {
  console.log('='.repeat(70));
  console.log('Testing Step 2 Filtering (LLM-based Semantic Filtering)');
  console.log('='.repeat(70));
  console.log();

  // Check if API keys are available
  const apiKeys = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()) || [];
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  console.log(`API Keys: ${apiKeys.length} keys configured`);
  console.log(`Model: ${model}`);
  console.log();

  if (apiKeys.length === 0) {
    console.error('ERROR: No API keys found in GEMINI_API_KEYS environment variable');
    process.exit(1);
  }

  console.log('Test Papers:');
  testPapers.forEach((paper, i) => {
    console.log(`  ${i + 1}. ${paper.title}`);
  });
  console.log();

  console.log('Inclusion Criteria:');
  console.log(`  ${inclusionCriteria}`);
  console.log();

  console.log('Exclusion Criteria:');
  console.log(`  ${exclusionCriteria}`);
  console.log();

  console.log('-'.repeat(70));
  console.log('Initializing LLM Service...');
  console.log('-'.repeat(70));

  try {
    // Create LLM service
    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: model,
      apiKeys: apiKeys,
      batchSize: 3, // Process all 3 papers in one batch
      maxConcurrentBatches: 1,
      temperature: 0.3,
      fallbackStrategy: 'fail', // Don't fall back to rule-based
      enableKeyRotation: true
    });

    await llmService.initialize();

    if (!llmService.isEnabled()) {
      throw new Error('LLM service failed to initialize');
    }

    console.log('✓ LLM Service initialized successfully');
    console.log();

    console.log('-'.repeat(70));
    console.log('Running Semantic Filtering (semanticFilterSeparate)...');
    console.log('-'.repeat(70));

    // Progress callback
    const progressCallback = (progress) => {
      const phaseLabel = progress.phase === 'inclusion' ? 'INCLUSION' : 'EXCLUSION';
      console.log(`[${phaseLabel}] Batch ${progress.currentBatch}/${progress.totalBatches} - Processed ${progress.processedPapers}/${progress.totalPapers} papers`);
    };

    // Run filtering
    const startTime = Date.now();
    const filteredPapers = await llmService.semanticFilterSeparate(
      testPapers,
      inclusionCriteria,
      exclusionCriteria,
      progressCallback
    );
    const duration = Date.now() - startTime;

    console.log();
    console.log('='.repeat(70));
    console.log(`Filtering Complete (${duration}ms)`);
    console.log('='.repeat(70));
    console.log();

    // Display results
    console.log('Results:');
    console.log();

    filteredPapers.forEach((paper, i) => {
      console.log(`Paper ${i + 1}: ${paper.title}`);
      console.log(`  Final Decision: ${paper.included ? '✓ INCLUDED' : '✗ EXCLUDED'}`);

      if (paper.systematic_filtering_inclusion !== undefined) {
        console.log(`  Inclusion Check: ${paper.systematic_filtering_inclusion ? '✓ PASS' : '✗ FAIL'}`);
        console.log(`  Inclusion Reasoning: ${paper.systematic_filtering_inclusion_reasoning || 'N/A'}`);
      } else {
        console.log(`  Inclusion Check: ⚠ NOT EVALUATED`);
      }

      if (paper.systematic_filtering_exclusion !== undefined) {
        console.log(`  Exclusion Check: ${paper.systematic_filtering_exclusion ? '✗ EXCLUDED' : '✓ PASS'}`);
        console.log(`  Exclusion Reasoning: ${paper.systematic_filtering_exclusion_reasoning || 'N/A'}`);
      } else {
        console.log(`  Exclusion Check: ⚠ NOT EVALUATED`);
      }

      if (paper.exclusionReason) {
        console.log(`  Exclusion Reason: ${paper.exclusionReason}`);
      }

      console.log();
    });

    // Summary
    const included = filteredPapers.filter(p => p.included).length;
    const excluded = filteredPapers.filter(p => !p.included).length;
    const hasInclusionData = filteredPapers.filter(p => p.systematic_filtering_inclusion !== undefined).length;
    const hasExclusionData = filteredPapers.filter(p => p.systematic_filtering_exclusion !== undefined).length;

    console.log('Summary:');
    console.log(`  Total Papers: ${filteredPapers.length}`);
    console.log(`  Included: ${included}`);
    console.log(`  Excluded: ${excluded}`);
    console.log(`  Papers with Inclusion Data: ${hasInclusionData}/${filteredPapers.length}`);
    console.log(`  Papers with Exclusion Data: ${hasExclusionData}/${filteredPapers.length}`);
    console.log();

    // Check for errors
    const errorsFound = filteredPapers.some(p =>
      p.systematic_filtering_inclusion_reasoning?.includes('Unable to evaluate') ||
      p.systematic_filtering_exclusion_reasoning?.includes('Unable to evaluate') ||
      p.exclusionReason?.includes('API rate limits')
    );

    if (errorsFound) {
      console.log('⚠ WARNING: Some papers were not properly evaluated due to API errors');
      process.exit(1);
    } else if (hasInclusionData === filteredPapers.length && hasExclusionData === filteredPapers.length) {
      console.log('✓ SUCCESS: All papers were properly evaluated');
      process.exit(0);
    } else {
      console.log('⚠ WARNING: Some papers are missing evaluation data');
      process.exit(1);
    }

  } catch (error) {
    console.error();
    console.error('='.repeat(70));
    console.error('ERROR:', error.message);
    console.error('='.repeat(70));
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testStep2Filtering().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
