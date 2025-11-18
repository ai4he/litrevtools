#!/usr/bin/env node
/**
 * Real End-to-End Test
 * Step 1: Extract papers from Semantic Scholar
 * Step 2: Apply semantic filtering with LLM
 */

const { LitRevDatabase } = require('./dist/core/database');
const { ScholarExtractor } = require('./dist/core/scholar');
const { LLMService } = require('./dist/core/llm/llm-service');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const testDbPath = path.join(__dirname, 'test-real-e2e.db');

// Clean up test database if it exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

async function runRealTest() {
  console.log('='.repeat(80));
  console.log('REAL END-TO-END TEST: Step 1 + Step 2');
  console.log('='.repeat(80));
  console.log();

  try {
    // Create database
    console.log('Setting up test database...');
    const db = new LitRevDatabase(testDbPath);
    console.log('✓ Database created');
    console.log();

    // ========================================================================
    // STEP 1: Extract Papers
    // ========================================================================
    console.log('='.repeat(80));
    console.log('STEP 1: Extracting Papers from Semantic Scholar');
    console.log('='.repeat(80));
    console.log();

    const inclusionKeywords = ['large language model', 'mathematical reasoning'];
    const maxResults = 10;

    console.log('Search Parameters:');
    console.log(`  Inclusion Keywords: ${inclusionKeywords.join(', ')}`);
    console.log(`  Max Results: ${maxResults}`);
    console.log(`  Year Range: All years`);
    console.log();

    const extractor = new ScholarExtractor(db);

    const sessionId = await extractor.startSearch(
      {
        inclusionKeywords,
        exclusionKeywords: [],
        maxResults,
        llmConfig: { enabled: false } // Disable LLM for Step 1
      },
      (progress) => {
        if (progress.currentTask) {
          console.log(`  [Progress] ${progress.currentTask}`);
        }
      },
      (paper) => {
        console.log(`  ✓ Found: ${paper.title.substring(0, 60)}...`);
      }
    );

    console.log();
    console.log(`✓ Step 1 Complete - Session ID: ${sessionId}`);
    console.log();

    // Get extracted papers
    const extractedPapers = db.getPapers(sessionId);
    console.log(`Total papers extracted: ${extractedPapers.length}`);
    console.log();

    if (extractedPapers.length === 0) {
      console.log('⚠ No papers found. Test cannot continue.');
      return;
    }

    // Show extracted papers
    console.log('Extracted Papers:');
    console.log('-'.repeat(80));
    extractedPapers.forEach((paper, i) => {
      console.log(`${i + 1}. ${paper.title}`);
      console.log(`   Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? '...' : ''}`);
      console.log(`   Year: ${paper.year} | Citations: ${paper.citationCount || 0}`);
      console.log();
    });

    // ========================================================================
    // STEP 2: Semantic Filtering
    // ========================================================================
    console.log('='.repeat(80));
    console.log('STEP 2: Applying Semantic Filtering with LLM');
    console.log('='.repeat(80));
    console.log();

    // Define criteria
    const inclusionCriteriaPrompt = `
Studies that use large language models (LLMs) or neural language models to solve mathematical
reasoning tasks, including but not limited to:
- Mathematical problem solving
- Theorem proving
- Mathematical question answering
- Reasoning over mathematical expressions or equations
- Chain-of-thought reasoning for mathematics
`.trim();

    const exclusionCriteriaPrompt = `
Studies that are:
- Pure surveys or literature reviews without novel methods
- Focused solely on language modeling without mathematical reasoning aspects
- Application papers without methodological contributions
- Workshop papers or short papers without substantial content
`.trim();

    console.log('Inclusion Criteria:');
    console.log(inclusionCriteriaPrompt);
    console.log();
    console.log('Exclusion Criteria:');
    console.log(exclusionCriteriaPrompt);
    console.log();

    // Initialize LLM service
    console.log('Initializing LLM Service...');
    const apiKeys = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()) || [];
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

    const llmService = new LLMService({
      enabled: true,
      provider: 'gemini',
      model: model,
      apiKeys: apiKeys,
      batchSize: 10, // Process all in one batch
      maxConcurrentBatches: 1,
      temperature: 0.3,
      fallbackStrategy: 'fail',
      enableKeyRotation: true
    });

    await llmService.initialize();
    console.log(`✓ LLM Service initialized (model: ${model}, API keys: ${apiKeys.length})`);
    console.log();

    console.log('Running semantic filtering...');
    console.log('-'.repeat(80));

    const startTime = Date.now();
    const filteredPapers = await llmService.semanticFilterSeparate(
      extractedPapers,
      inclusionCriteriaPrompt,
      exclusionCriteriaPrompt,
      (progress) => {
        const phase = progress.phase.toUpperCase();
        console.log(`[${phase}] Batch ${progress.currentBatch}/${progress.totalBatches} - ${progress.processedPapers}/${progress.totalPapers} papers`);
      }
    );
    const duration = Date.now() - startTime;

    console.log();
    console.log(`✓ Semantic filtering complete (${(duration / 1000).toFixed(1)}s)`);
    console.log();

    // Update database
    console.log('Updating database with results...');
    filteredPapers.forEach(paper => {
      db.addPaper(sessionId, paper);
    });
    console.log('✓ Database updated');
    console.log();

    // ========================================================================
    // RESULTS
    // ========================================================================
    console.log('='.repeat(80));
    console.log('FINAL RESULTS');
    console.log('='.repeat(80));
    console.log();

    const included = filteredPapers.filter(p => p.included);
    const excluded = filteredPapers.filter(p => !p.included);

    console.log('Summary:');
    console.log(`  Total Papers: ${filteredPapers.length}`);
    console.log(`  Included: ${included.length}`);
    console.log(`  Excluded: ${excluded.length}`);
    console.log();

    // Show included papers
    if (included.length > 0) {
      console.log('INCLUDED PAPERS:');
      console.log('='.repeat(80));
      included.forEach((paper, i) => {
        console.log();
        console.log(`${i + 1}. ${paper.title}`);
        console.log(`   Authors: ${paper.authors.slice(0, 2).join(', ')}${paper.authors.length > 2 ? ' et al.' : ''}`);
        console.log(`   Year: ${paper.year}`);
        console.log();
        console.log(`   ✓ Inclusion: ${paper.systematic_filtering_inclusion ? 'PASS' : 'FAIL'}`);
        console.log(`   Reasoning: ${paper.systematic_filtering_inclusion_reasoning}`);
        console.log();
        console.log(`   ✓ Exclusion: ${paper.systematic_filtering_exclusion ? 'EXCLUDED' : 'PASS'}`);
        console.log(`   Reasoning: ${paper.systematic_filtering_exclusion_reasoning}`);
        console.log();
      });
    }

    // Show excluded papers
    if (excluded.length > 0) {
      console.log();
      console.log('EXCLUDED PAPERS:');
      console.log('='.repeat(80));
      excluded.forEach((paper, i) => {
        console.log();
        console.log(`${i + 1}. ${paper.title}`);
        console.log(`   Authors: ${paper.authors.slice(0, 2).join(', ')}${paper.authors.length > 2 ? ' et al.' : ''}`);
        console.log(`   Year: ${paper.year}`);
        console.log();
        console.log(`   Exclusion Reason: ${paper.exclusionReason}`);
        console.log();
        console.log(`   Inclusion Check: ${paper.systematic_filtering_inclusion ? 'PASS' : 'FAIL'}`);
        console.log(`   Reasoning: ${paper.systematic_filtering_inclusion_reasoning}`);
        console.log();
        console.log(`   Exclusion Check: ${paper.systematic_filtering_exclusion ? 'EXCLUDED' : 'PASS'}`);
        console.log(`   Reasoning: ${paper.systematic_filtering_exclusion_reasoning}`);
        console.log();
      });
    }

    // Validation
    console.log('='.repeat(80));
    console.log('VALIDATION');
    console.log('='.repeat(80));

    const hasAllInclusionData = filteredPapers.every(p =>
      p.systematic_filtering_inclusion !== undefined &&
      p.systematic_filtering_inclusion_reasoning
    );

    const hasAllExclusionData = filteredPapers.every(p =>
      p.systematic_filtering_exclusion !== undefined &&
      p.systematic_filtering_exclusion_reasoning
    );

    const hasErrors = filteredPapers.some(p =>
      p.systematic_filtering_inclusion_reasoning?.includes('Unable to evaluate') ||
      p.systematic_filtering_exclusion_reasoning?.includes('Unable to evaluate')
    );

    console.log(`✓ All papers have inclusion data: ${hasAllInclusionData ? 'YES' : 'NO'}`);
    console.log(`✓ All papers have exclusion data: ${hasAllExclusionData ? 'YES' : 'NO'}`);
    console.log(`✓ No API errors: ${!hasErrors ? 'YES' : 'NO'}`);
    console.log();

    if (hasAllInclusionData && hasAllExclusionData && !hasErrors) {
      console.log('🎉 TEST PASSED - All systematic filtering fields properly populated!');
    } else {
      console.log('⚠ TEST FAILED - Some fields are missing or have errors');
    }

  } catch (error) {
    console.error();
    console.error('='.repeat(80));
    console.error('ERROR:', error.message);
    console.error('='.repeat(80));
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log();
      console.log('Test database cleaned up');
    }
  }
}

runRealTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
