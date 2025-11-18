#!/usr/bin/env node
/**
 * Integration test for Step 2 filtering with database
 * Tests the complete flow including database updates
 */

const { LitRevDatabase } = require('./dist/core/database');
const { LLMService } = require('./dist/core/llm/llm-service');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const testDbPath = path.join(__dirname, 'test-step2.db');

// Clean up test database if it exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Sample papers
const testPapers = [
  {
    id: 'paper1',
    paperId: 'paper1',
    title: 'AI-Powered Clinical Decision Support Systems',
    authors: ['Smith, J.', 'Doe, A.'],
    year: 2024,
    publishedDate: new Date('2024-01-15'),
    extractedAt: new Date(),
    abstract: 'Machine learning system for assisting physicians in clinical decision-making.',
    venue: 'Journal of Medical Informatics',
    citationCount: 45,
    source: 'semantic_scholar',
    url: 'https://example.com/paper1',
    included: true
  },
  {
    id: 'paper2',
    paperId: 'paper2',
    title: 'Review of Deep Learning in Healthcare',
    authors: ['Johnson, B.'],
    year: 2023,
    publishedDate: new Date('2023-06-20'),
    extractedAt: new Date(),
    abstract: 'A comprehensive review of deep learning techniques applied to healthcare.',
    venue: 'Healthcare Review Journal',
    citationCount: 120,
    source: 'semantic_scholar',
    url: 'https://example.com/paper2',
    included: true
  },
  {
    id: 'paper3',
    paperId: 'paper3',
    title: 'Predictive Analytics for Patient Outcomes',
    authors: ['Lee, C.'],
    year: 2024,
    publishedDate: new Date('2024-03-10'),
    extractedAt: new Date(),
    abstract: 'Using machine learning to predict patient outcomes in intensive care units.',
    venue: 'Critical Care Medicine',
    citationCount: 32,
    source: 'semantic_scholar',
    url: 'https://example.com/paper3',
    included: true
  }
];

async function runIntegrationTest() {
  console.log('='.repeat(70));
  console.log('Step 2 Integration Test (with Database)');
  console.log('='.repeat(70));
  console.log();

  try {
    // Create database
    console.log('Creating test database...');
    const db = new LitRevDatabase(testDbPath);

    // Create a test session
    const sessionId = db.createSession({
      inclusionKeywords: ['machine learning', 'healthcare'],
      exclusionKeywords: ['survey', 'review'],
      maxResults: 10,
      llmConfig: {
        enabled: true,
        provider: 'gemini'
      }
    });

    console.log(`✓ Created session: ${sessionId}`);
    console.log();

    // Add papers to database
    console.log('Adding test papers to database...');
    testPapers.forEach(paper => {
      db.addPaper(sessionId, paper);
    });
    console.log(`✓ Added ${testPapers.length} papers`);
    console.log();

    // Initialize LLM service
    console.log('Initializing LLM service...');
    const apiKeys = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()) || [];
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: model,
      apiKeys: apiKeys,
      batchSize: 3,
      maxConcurrentBatches: 1,
      temperature: 0.3,
      fallbackStrategy: 'fail',
      enableKeyRotation: true
    });

    await llmService.initialize();
    console.log(`✓ LLM service initialized with model: ${model}`);
    console.log();

    // Run semantic filtering
    console.log('Running semantic filtering...');
    const inclusionCriteria = 'Studies using AI/ML for clinical healthcare applications (diagnosis, treatment, patient care).';
    const exclusionCriteria = 'Review papers, surveys, or purely theoretical studies without practical implementation.';

    const filteredPapers = await llmService.semanticFilterSeparate(
      testPapers,
      inclusionCriteria,
      exclusionCriteria,
      (progress) => {
        console.log(`  [${progress.phase.toUpperCase()}] Batch ${progress.currentBatch}/${progress.totalBatches}`);
      }
    );

    console.log(`✓ Filtering complete`);
    console.log();

    // Update database with filtered papers
    console.log('Updating database with filtering results...');
    filteredPapers.forEach(paper => {
      db.addPaper(sessionId, paper);
    });
    console.log(`✓ Database updated`);
    console.log();

    // Verify results from database
    console.log('Verifying results from database...');
    const papersFromDb = db.getPapers(sessionId);

    console.log();
    console.log('Results:');
    console.log('-'.repeat(70));

    let allFieldsPresent = true;
    papersFromDb.forEach((paper, i) => {
      console.log(`\nPaper ${i + 1}: ${paper.title}`);
      console.log(`  Included: ${paper.included ? 'YES ✓' : 'NO ✗'}`);

      const hasInclusion = paper.systematic_filtering_inclusion !== undefined && paper.systematic_filtering_inclusion !== null;
      const hasInclusionReasoning = paper.systematic_filtering_inclusion_reasoning && paper.systematic_filtering_inclusion_reasoning.trim().length > 0;
      const hasExclusion = paper.systematic_filtering_exclusion !== undefined && paper.systematic_filtering_exclusion !== null;
      const hasExclusionReasoning = paper.systematic_filtering_exclusion_reasoning && paper.systematic_filtering_exclusion_reasoning.trim().length > 0;

      console.log(`  Inclusion Check: ${hasInclusion ? '✓' : '✗'} (${paper.systematic_filtering_inclusion})`);
      console.log(`  Inclusion Reasoning: ${hasInclusionReasoning ? '✓' : '✗'} (${paper.systematic_filtering_inclusion_reasoning?.substring(0, 60)}...)`);
      console.log(`  Exclusion Check: ${hasExclusion ? '✓' : '✗'} (${paper.systematic_filtering_exclusion})`);
      console.log(`  Exclusion Reasoning: ${hasExclusionReasoning ? '✓' : '✗'} (${paper.systematic_filtering_exclusion_reasoning?.substring(0, 60)}...)`);

      if (!hasInclusion || !hasInclusionReasoning || !hasExclusion || !hasExclusionReasoning) {
        allFieldsPresent = false;
      }

      // Check for error messages
      const hasError = paper.systematic_filtering_inclusion_reasoning?.includes('Unable to evaluate') ||
                       paper.systematic_filtering_exclusion_reasoning?.includes('Unable to evaluate') ||
                       paper.exclusionReason?.includes('API rate limits');

      if (hasError) {
        console.log(`  ⚠ ERROR DETECTED: Paper has API error messages`);
        allFieldsPresent = false;
      }
    });

    console.log();
    console.log('='.repeat(70));
    console.log('Summary');
    console.log('='.repeat(70));

    const includedCount = papersFromDb.filter(p => p.included).length;
    const excludedCount = papersFromDb.filter(p => !p.included).length;

    console.log(`Total Papers: ${papersFromDb.length}`);
    console.log(`Included: ${includedCount}`);
    console.log(`Excluded: ${excludedCount}`);
    console.log();

    if (allFieldsPresent) {
      console.log('✓ SUCCESS: All papers have complete systematic filtering data');
      console.log('✓ All fields are properly populated in the database');
      return 0;
    } else {
      console.log('✗ FAILURE: Some papers are missing filtering data or have errors');
      return 1;
    }

  } catch (error) {
    console.error();
    console.error('='.repeat(70));
    console.error('ERROR:', error.message);
    console.error('='.repeat(70));
    if (error.stack) {
      console.error(error.stack);
    }
    return 1;
  } finally {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log();
      console.log('Test database cleaned up');
    }
  }
}

runIntegrationTest()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
