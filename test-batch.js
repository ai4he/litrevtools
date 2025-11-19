/**
 * Test script for batch processing
 * Usage: node test-batch.js
 */

const { LitRevTools } = require('./dist/core');

async function testBatchProcessing() {
  console.log('='.repeat(80));
  console.log('TESTING BATCH PROCESSING');
  console.log('='.repeat(80));

  const tools = new LitRevTools();

  // Test with a small dataset
  const testPapers = [
    {
      id: 'test-paper-1',
      title: 'Machine Learning for Healthcare Applications',
      authors: ['John Doe', 'Jane Smith'],
      year: 2023,
      abstract: 'This paper presents a novel machine learning approach for predicting patient outcomes in healthcare settings. We propose a deep learning architecture that achieves state-of-the-art results.',
      venue: 'ICML',
      citationCount: 50,
      url: 'https://example.com/paper1',
      source: 'test',
      extractedAt: new Date()
    },
    {
      id: 'test-paper-2',
      title: 'A Survey of Deep Learning Methods',
      authors: ['Alice Brown'],
      year: 2022,
      abstract: 'This survey paper reviews existing deep learning methods across various domains. We provide a comprehensive overview of the field.',
      venue: 'Nature Reviews',
      citationCount: 200,
      url: 'https://example.com/paper2',
      source: 'test',
      extractedAt: new Date()
    },
    {
      id: 'test-paper-3',
      title: 'AI in Medical Diagnosis',
      authors: ['Bob Wilson'],
      year: 2024,
      abstract: 'We explore the application of artificial intelligence in medical diagnosis, focusing on image-based diagnostics and predictive modeling.',
      venue: 'NEJM',
      citationCount: 30,
      url: 'https://example.com/paper3',
      source: 'test',
      extractedAt: new Date()
    }
  ];

  console.log(`\nTest dataset: ${testPapers.length} papers`);
  console.log('Batch size: 3 (all papers in one batch)\n');

  const inclusionCriteria = 'Papers must present novel AI or machine learning methods with healthcare applications.';
  const exclusionCriteria = 'Survey papers and review papers should be excluded.';

  try {
    console.log('Starting batch semantic filtering...\n');

    // Create a temporary session to use the semantic filtering
    const sessionId = await tools.startSearch({
      inclusionKeywords: ['machine learning', 'healthcare'],
      exclusionKeywords: [],
      maxResults: 0, // Don't actually search
      startYear: 2020,
      endYear: 2024,
      llmConfig: {
        enabled: true,
        provider: 'gemini',
        model: 'auto',
        batchSize: 3,
        apiKeys: process.env.GEMINI_API_KEYS?.split(',').filter(k => k.trim()) || []
      }
    });

    // Insert test papers directly into the database
    const { LitRevDatabase } = require('./dist/core/database');
    const dbPath = process.env.DATABASE_PATH || './data/litrevtools.db';
    const db = new LitRevDatabase(dbPath);

    for (const paper of testPapers) {
      db.addPaper(sessionId, paper);
    }

    console.log(`Inserted ${testPapers.length} test papers into session ${sessionId}`);

    // Apply semantic filtering
    await tools.applySemanticFiltering(
      sessionId,
      inclusionCriteria,
      exclusionCriteria
    );

    console.log('\n' + '='.repeat(80));
    console.log('DETAILED RESULTS');
    console.log('='.repeat(80));

    // Get papers from database after filtering
    const filteredPapers = db.getPapers(sessionId);

    filteredPapers.forEach((paper, index) => {
      console.log(`\n${index + 1}. ${paper.title}`);
      console.log(`   Final Status: ${paper.included ? '✅ INCLUDED' : '❌ EXCLUDED'}`);
      console.log(`   Inclusion Test: ${paper.systematic_filtering_inclusion ? '✓ PASS' : '✗ FAIL'}`);
      if (paper.systematic_filtering_inclusion_reasoning) {
        console.log(`   Inclusion Reasoning: ${paper.systematic_filtering_inclusion_reasoning.substring(0, 200)}...`);
      }
      console.log(`   Exclusion Test: ${paper.systematic_filtering_exclusion ? '✗ EXCLUDE' : '✓ PASS'}`);
      if (paper.systematic_filtering_exclusion_reasoning) {
        console.log(`   Exclusion Reasoning: ${paper.systematic_filtering_exclusion_reasoning.substring(0, 200)}...`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('TEST FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testBatchProcessing();
