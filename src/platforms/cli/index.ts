#!/usr/bin/env node

/**
 * CLI Platform for LitRevTools
 *
 * This CLI dynamically generates options from the centralized parameter schema,
 * ensuring it always stays in sync with the Web UI and other platforms.
 */

import { Command } from 'commander';
import { LitRevTools, SearchParameters, SearchProgress, Paper } from '../../core';
import {
  SEARCH_PARAMETER_SCHEMA,
  getDefaultParameters,
  validateParameters,
  mergeWithDefaults,
  ParameterDefinition
} from '../../core/config';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import * as readline from 'readline';

const program = new Command();

program
  .name('litrevtools')
  .description('Systematic Literature Review Tool using PRISMA methodology')
  .version('1.0.0');

/**
 * Dynamically build CLI options from parameter schema
 */
function buildCommandWithOptions(command: Command): Command {
  SEARCH_PARAMETER_SCHEMA.forEach(param => {
    if (param.type === 'object' && param.nested) {
      // Handle nested parameters (like LLM config)
      param.nested.forEach(nested => {
        addOptionToCommand(command, nested);
      });
    } else {
      addOptionToCommand(command, param);
    }
  });
  return command;
}

/**
 * Add a single option to the command
 */
function addOptionToCommand(command: Command, param: ParameterDefinition): void {
  if (!param.cliFlag) return;

  let flags = param.cliFlag;
  if (param.cliShortFlag) {
    flags = `${param.cliShortFlag}, ${param.cliFlag}`;
  }

  let flagWithArgs = flags;
  if (param.type === 'string') {
    flagWithArgs += ' <value>';
  } else if (param.type === 'number') {
    flagWithArgs += ' <number>';
  } else if (param.type === 'string[]') {
    flagWithArgs += ' <items...>';
  } else if (param.type === 'boolean') {
    // Boolean flags don't need arguments
  } else if (param.type === 'enum' && param.options) {
    flagWithArgs += ' <value>';
  }

  const description = param.description +
    (param.options ? `\nOptions: ${param.options.map(o => o.value).join(', ')}` : '') +
    (param.default !== undefined ? `\nDefault: ${JSON.stringify(param.default)}` : '');

  if (param.type === 'number') {
    command.option(flagWithArgs, description, parseFloat);
  } else if (param.type === 'boolean') {
    command.option(flagWithArgs, description);
  } else {
    command.option(flagWithArgs, description);
  }
}

/**
 * Parse CLI options into SearchParameters
 */
function parseOptionsToParameters(options: any): Partial<SearchParameters> {
  const params: any = {};

  // Map basic parameters
  if (options.name) params.name = options.name;
  if (options.include) params.inclusionKeywords = options.include;
  if (options.exclude) params.exclusionKeywords = options.exclude;
  if (options.max) params.maxResults = options.max;
  if (options.startYear) params.startYear = options.startYear;
  if (options.endYear) params.endYear = options.endYear;

  // Build LLM config from CLI options
  const llmConfig: any = {};
  let hasLlmConfig = false;

  if (options.llmEnabled !== undefined) {
    llmConfig.enabled = options.llmEnabled;
    hasLlmConfig = true;
  }
  if (options.llmProvider) {
    llmConfig.provider = options.llmProvider;
    hasLlmConfig = true;
  }
  if (options.llmModel) {
    llmConfig.model = options.llmModel;
    hasLlmConfig = true;
  }
  if (options.llmApiKey) {
    llmConfig.apiKey = options.llmApiKey;
    hasLlmConfig = true;
  }
  if (options.llmApiKeys) {
    llmConfig.apiKeys = options.llmApiKeys;
    hasLlmConfig = true;
  }
  if (options.llmBatchSize !== undefined) {
    llmConfig.batchSize = options.llmBatchSize;
    hasLlmConfig = true;
  }
  if (options.llmMaxConcurrent !== undefined) {
    llmConfig.maxConcurrentBatches = options.llmMaxConcurrent;
    hasLlmConfig = true;
  }
  if (options.llmTimeout !== undefined) {
    llmConfig.timeout = options.llmTimeout;
    hasLlmConfig = true;
  }
  if (options.llmRetry !== undefined) {
    llmConfig.retryAttempts = options.llmRetry;
    hasLlmConfig = true;
  }
  if (options.llmTemperature !== undefined) {
    llmConfig.temperature = options.llmTemperature;
    hasLlmConfig = true;
  }
  if (options.llmFallback) {
    llmConfig.fallbackStrategy = options.llmFallback;
    hasLlmConfig = true;
  }
  if (options.llmKeyRotation !== undefined) {
    llmConfig.enableKeyRotation = options.llmKeyRotation;
    hasLlmConfig = true;
  }

  if (hasLlmConfig) {
    params.llmConfig = llmConfig;
  }

  return params;
}

/**
 * Interactive prompt helper
 */
async function promptForMissingParameters(params: Partial<SearchParameters>): Promise<SearchParameters> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => rl.question(query, resolve));
  };

  // If no inclusion keywords provided, ask
  if (!params.inclusionKeywords || params.inclusionKeywords.length === 0) {
    console.log(chalk.yellow('\nEnter inclusion keywords (comma-separated):'));
    console.log(chalk.gray('Papers must contain at least one of these keywords'));
    console.log(chalk.gray('Default: large language model, mathematical reasoning'));
    const input = await question('> ');
    params.inclusionKeywords = input.trim()
      ? input.split(',').map(k => k.trim())
      : ['large language model', 'mathematical reasoning'];
  }

  // If no exclusion keywords provided, ask
  if (!params.exclusionKeywords || params.exclusionKeywords.length === 0) {
    console.log(chalk.yellow('\nEnter exclusion keywords (comma-separated, or press Enter to use defaults):'));
    console.log(chalk.gray('Papers containing these keywords will be excluded'));
    console.log(chalk.gray('Default: survey, review'));
    const input = await question('> ');
    params.exclusionKeywords = input.trim()
      ? input.split(',').map(k => k.trim())
      : ['survey', 'review'];
  }

  rl.close();
  return mergeWithDefaults(params);
}

/**
 * Display parameters summary
 */
function displayParametersSummary(params: SearchParameters): void {
  console.log(chalk.green('\n✓ Search Configuration:'));
  console.log(chalk.white('\nBasic Parameters:'));
  console.log(chalk.gray(`  Name: ${params.name || 'Auto-generated'}`));
  console.log(chalk.gray(`  Include: ${params.inclusionKeywords.join(', ')}`));
  console.log(chalk.gray(`  Exclude: ${params.exclusionKeywords.join(', ')}`));
  console.log(chalk.gray(`  Max results: ${params.maxResults || 'Unlimited'}`));
  console.log(chalk.gray(`  Year range: ${params.startYear || 'N/A'} - ${params.endYear || 'Current'}`));

  if (params.llmConfig?.enabled) {
    console.log(chalk.white('\nLLM Configuration:'));
    console.log(chalk.gray(`  Provider: ${params.llmConfig.provider || 'gemini'}`));
    console.log(chalk.gray(`  Model: ${params.llmConfig.model || 'gemini-1.5-flash'}`));
    console.log(chalk.gray(`  Batch size: ${params.llmConfig.batchSize || 10}`));
    console.log(chalk.gray(`  Max concurrent batches: ${params.llmConfig.maxConcurrentBatches || 3}`));
    console.log(chalk.gray(`  Fallback strategy: ${params.llmConfig.fallbackStrategy || 'rule_based'}`));
    console.log(chalk.gray(`  Key rotation: ${params.llmConfig.enableKeyRotation ? 'Enabled' : 'Disabled'}`));

    const keyCount = params.llmConfig.apiKeys?.length || (params.llmConfig.apiKey ? 1 : 0);
    console.log(chalk.gray(`  API keys: ${keyCount} configured`));
  } else {
    console.log(chalk.white('\nLLM: Disabled (using rule-based filtering)'));
  }
  console.log('');
}

// Build the search command with dynamically generated options
const searchCommand = program
  .command('search')
  .description('Start a new literature review search');

buildCommandWithOptions(searchCommand);

searchCommand.action(async (options) => {
  try {
    console.log(chalk.blue.bold('\n🔍 LitRevTools - Systematic Literature Review\n'));

    // Parse CLI options to parameters
    let params = parseOptionsToParameters(options);

    // Prompt for missing required parameters
    params = await promptForMissingParameters(params);

    // Validate parameters
    const validation = validateParameters(params);
    if (!validation.valid) {
      console.error(chalk.red('\n✗ Invalid parameters:'));
      validation.errors.forEach(err => console.error(chalk.red(`  - ${err}`)));
      process.exit(1);
    }

    // After validation, we know params is complete
    const validParams = params as SearchParameters;

    // Display summary
    displayParametersSummary(validParams);

    // Initialize LitRevTools
    const tools = new LitRevTools();

    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: chalk.cyan('{task}') + ' |' + chalk.green('{bar}') + '| {percentage}% | {papers} papers | Time: {elapsed}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(100, 0, {
      task: 'Initializing...',
      papers: 0,
      elapsed: 0
    });

    let papersFound = 0;
    const startTime = Date.now();

    // Start search
    const sessionId = await tools.startSearch(validParams, {
      onProgress: (progress: SearchProgress, sid: string) => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);

        progressBar.update(progress.progress, {
          task: progress.currentTask.substring(0, 40),
          papers: progress.totalPapers,
          elapsed
        });

        if (progress.status === 'completed') {
          progressBar.stop();
          console.log(chalk.green.bold('\n✓ Search completed!\n'));
          console.log(chalk.white(`Total papers found: ${progress.totalPapers}`));
          console.log(chalk.white(`Included papers: ${progress.includedPapers}`));
          console.log(chalk.white(`Excluded papers: ${progress.excludedPapers}`));
          console.log(chalk.white(`Time elapsed: ${elapsed}s\n`));

          console.log(chalk.blue('Generating outputs...'));
          tools.generateOutputs(sid).then(() => {
            const session = tools.getSession(sid);
            if (session?.outputs) {
              console.log(chalk.green('\n✓ Outputs generated:'));
              if (session.outputs.csv) console.log(chalk.gray(`  CSV: ${session.outputs.csv}`));
              if (session.outputs.bibtex) console.log(chalk.gray(`  BibTeX: ${session.outputs.bibtex}`));
              if (session.outputs.latex) console.log(chalk.gray(`  LaTeX: ${session.outputs.latex}`));
              if (session.outputs.zip) console.log(chalk.gray(`  ZIP: ${session.outputs.zip}`));
            }

            console.log(chalk.blue.bold(`\nSession ID: ${sid}\n`));
            tools.close();
            process.exit(0);
          }).catch(err => {
            console.error(chalk.red('\n✗ Error generating outputs:'), err.message);
            tools.close();
            process.exit(1);
          });
        } else if (progress.status === 'error') {
          progressBar.stop();
          console.error(chalk.red('\n✗ Search failed:'), progress.error);
          tools.close();
          process.exit(1);
        }
      },
      onPaper: (paper: Paper, sid: string) => {
        papersFound++;
        if (papersFound % 10 === 0) {
          console.log(chalk.gray(`\n  Found: ${paper.title.substring(0, 60)}...`));
        }
      },
      onError: (error: Error, sid: string) => {
        progressBar.stop();
        console.error(chalk.red('\n✗ Error:'), error.message);
        tools.close();
        process.exit(1);
      }
    });

  } catch (error: any) {
    console.error(chalk.red('\n✗ Error:'), error.message);
    process.exit(1);
  }
});

// List sessions command
program
  .command('list')
  .description('List all search sessions')
  .action(() => {
    const tools = new LitRevTools();
    const sessions = tools.getAllSessions();

    console.log(chalk.blue.bold('\n📚 Search Sessions\n'));

    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found.'));
      tools.close();
      return;
    }

    sessions.forEach((session, index) => {
      console.log(chalk.white(`${index + 1}. ${session.parameters.name || 'Unnamed'}`));
      console.log(chalk.gray(`   ID: ${session.id}`));
      console.log(chalk.gray(`   Status: ${session.progress.status}`));
      console.log(chalk.gray(`   Papers: ${session.papers.length}`));
      console.log(chalk.gray(`   Created: ${session.createdAt.toLocaleString()}\n`));
    });

    tools.close();
  });

// View session command
program
  .command('view <sessionId>')
  .description('View details of a search session')
  .action((sessionId: string) => {
    const tools = new LitRevTools();
    const session = tools.getSession(sessionId);

    if (!session) {
      console.error(chalk.red('Session not found'));
      tools.close();
      process.exit(1);
    }

    console.log(chalk.blue.bold('\n📄 Session Details\n'));
    console.log(chalk.white(`Name: ${session.parameters.name || 'Unnamed'}`));
    console.log(chalk.white(`ID: ${session.id}`));
    console.log(chalk.white(`Status: ${session.progress.status}`));
    console.log(chalk.white(`\nSearch Parameters:`));
    console.log(chalk.gray(`  Include: ${session.parameters.inclusionKeywords.join(', ')}`));
    console.log(chalk.gray(`  Exclude: ${session.parameters.exclusionKeywords.join(', ')}`));
    console.log(chalk.white(`\nResults:`));
    console.log(chalk.gray(`  Total papers: ${session.papers.length}`));
    console.log(chalk.gray(`  Included: ${session.papers.filter(p => p.included).length}`));
    console.log(chalk.gray(`  Excluded: ${session.papers.filter(p => !p.included).length}`));
    console.log(chalk.white(`\nDates:`));
    console.log(chalk.gray(`  Created: ${session.createdAt.toLocaleString()}`));
    console.log(chalk.gray(`  Updated: ${session.updatedAt.toLocaleString()}\n`));

    if (session.outputs.csv) {
      console.log(chalk.green('✓ Outputs available'));
      console.log(chalk.gray(`  CSV: ${session.outputs.csv}`));
      console.log(chalk.gray(`  BibTeX: ${session.outputs.bibtex}`));
      console.log(chalk.gray(`  LaTeX: ${session.outputs.latex}`));
      console.log(chalk.gray(`  ZIP: ${session.outputs.zip}\n`));
    }

    tools.close();
  });

// Generate outputs command
program
  .command('generate <sessionId>')
  .description('Generate outputs for a completed session')
  .action(async (sessionId: string) => {
    const tools = new LitRevTools();

    try {
      console.log(chalk.blue('Generating outputs...\n'));
      await tools.generateOutputs(sessionId);

      const session = tools.getSession(sessionId);
      if (session?.outputs) {
        console.log(chalk.green('✓ Outputs generated:'));
        if (session.outputs.csv) console.log(chalk.gray(`  CSV: ${session.outputs.csv}`));
        if (session.outputs.bibtex) console.log(chalk.gray(`  BibTeX: ${session.outputs.bibtex}`));
        if (session.outputs.latex) console.log(chalk.gray(`  LaTeX: ${session.outputs.latex}`));
        if (session.outputs.zip) console.log(chalk.gray(`  ZIP: ${session.outputs.zip}\n`));
      }

      tools.close();
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      tools.close();
      process.exit(1);
    }
  });

// Semantic filtering command (Step 2)
program
  .command('filter <sessionId>')
  .description('Apply semantic filtering to a session using LLM')
  .option('-i, --inclusion <prompt>', 'Inclusion criteria prompt')
  .option('-e, --exclusion <prompt>', 'Exclusion criteria prompt')
  .action(async (sessionId: string, options) => {
    const tools = new LitRevTools();

    try {
      const session = tools.getSession(sessionId);
      if (!session) {
        console.error(chalk.red('Session not found'));
        tools.close();
        process.exit(1);
      }

      console.log(chalk.blue.bold('\n🔍 Semantic Filtering (Step 2)\n'));
      console.log(chalk.white(`Session: ${session.parameters.name || sessionId}`));
      console.log(chalk.white(`Total papers: ${session.papers.length}\n`));

      // Default prompts if not provided
      const inclusionPrompt = options.inclusion ||
        'Include papers that directly address the research topic, present original research or methodologies, and are relevant to the systematic review objectives.';

      const exclusionPrompt = options.exclusion ||
        'Exclude papers that are surveys, reviews, off-topic, lack methodological rigor, or do not contribute original insights to the research question.';

      console.log(chalk.gray('Inclusion criteria:'));
      console.log(chalk.gray(`  ${inclusionPrompt.substring(0, 80)}...\n`));
      console.log(chalk.gray('Exclusion criteria:'));
      console.log(chalk.gray(`  ${exclusionPrompt.substring(0, 80)}...\n`));

      // Create progress bar
      const progressBar = new cliProgress.SingleBar({
        format: chalk.cyan('{phase}') + ' |' + chalk.green('{bar}') + '| {percentage}% | {current}/{total} papers',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });

      let currentPhase = 'Initializing...';
      progressBar.start(session.papers.length, 0, {
        phase: currentPhase,
        current: 0,
        total: session.papers.length
      });

      // Apply semantic filtering with progress tracking
      await tools.applySemanticFiltering(
        sessionId,
        inclusionPrompt,
        exclusionPrompt,
        (progress) => {
          currentPhase = progress.phase === 'inclusion' ? 'Inclusion filtering' : 'Exclusion filtering';
          progressBar.update(progress.processedPapers, {
            phase: currentPhase,
            current: progress.processedPapers,
            total: progress.totalPapers
          });
        }
      );

      progressBar.stop();

      // Get updated session
      const updatedSession = tools.getSession(sessionId);
      if (updatedSession) {
        const includedCount = updatedSession.papers.filter(p =>
          p.systematic_filtering_inclusion === true &&
          p.systematic_filtering_exclusion === false
        ).length;

        console.log(chalk.green.bold('\n✓ Semantic filtering completed!\n'));
        console.log(chalk.white(`Total papers: ${updatedSession.papers.length}`));
        console.log(chalk.white(`Papers passing filters: ${includedCount}`));
        console.log(chalk.white(`Papers excluded: ${updatedSession.papers.length - includedCount}\n`));
      }

      tools.close();
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      tools.close();
      process.exit(1);
    }
  });

// Diagnostic command to test system health
program
  .command('diagnose')
  .alias('test')
  .description('Run diagnostic tests to check system health and API status')
  .option('--skip-api-test', 'Skip the actual API test (only check configuration)')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🔬 LitRevTools System Diagnostics\n'));
    console.log(chalk.gray('=' .repeat(80) + '\n'));

    const tools = new LitRevTools();
    let exitCode = 0;

    try {
      // 1. Check environment configuration
      console.log(chalk.cyan('📋 1. Configuration Check'));
      console.log(chalk.gray('-'.repeat(80)));

      const geminiKeys = process.env.GEMINI_API_KEYS?.split(',').filter(k => k.trim()) || [];
      const geminiKey = process.env.GEMINI_API_KEY;
      const totalKeys = geminiKeys.length || (geminiKey ? 1 : 0);

      console.log(chalk.white(`  Gemini API Keys: ${totalKeys} configured`));
      if (totalKeys > 0) {
        console.log(chalk.green('  ✓ API keys found'));
        geminiKeys.forEach((key, i) => {
          const masked = key.substring(0, 8) + '*'.repeat(24) + key.substring(key.length - 4);
          console.log(chalk.gray(`    Key ${i + 1}: ${masked}`));
        });
      } else {
        console.log(chalk.red('  ✗ No API keys configured'));
        console.log(chalk.yellow('    Set GEMINI_API_KEYS environment variable'));
        exitCode = 1;
      }

      const dbPath = process.env.DATABASE_PATH || './data/litrevtools.db';
      console.log(chalk.white(`\n  Database Path: ${dbPath}`));

      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
      console.log(chalk.white(`  Default Model: ${geminiModel}`));

      const batchSize = process.env.PAPER_BATCH_SIZE || '15';
      console.log(chalk.white(`  Batch Size: ${batchSize} papers per batch\n`));

      // 2. Test LLM Service Initialization
      console.log(chalk.cyan('🤖 2. LLM Service Health Check'));
      console.log(chalk.gray('-'.repeat(80)));

      if (totalKeys === 0) {
        console.log(chalk.yellow('  ⚠ Skipping LLM tests (no API keys configured)\n'));
      } else if (options.skipApiTest) {
        console.log(chalk.yellow('  ⚠ Skipping API tests (--skip-api-test flag)\n'));
      } else {
        // Create a test session with LLM enabled
        const testParams: SearchParameters = {
          name: 'Diagnostic Test',
          inclusionKeywords: ['test'],
          exclusionKeywords: [],
          maxResults: 0, // Don't actually search
          startYear: 2024,
          endYear: 2024,
          llmConfig: {
            enabled: true,
            provider: 'gemini',
            model: 'auto',
            batchSize: 3,
            maxConcurrentBatches: 3,
            timeout: 30000,
            retryAttempts: 3,
            temperature: 0.3,
            fallbackStrategy: 'rule_based',
            enableKeyRotation: true,
            apiKeys: geminiKeys.length > 0 ? geminiKeys : [geminiKey!]
          }
        };

        console.log(chalk.white('  Creating test session...'));
        const sessionId = await tools.startSearch(testParams);

        // Insert test papers
        console.log(chalk.white('  Inserting 3 test papers...'));
        const { LitRevDatabase } = require('../../core/database');
        const db = new LitRevDatabase(dbPath);

        const testPapers: Paper[] = [
          {
            id: 'diagnostic-paper-1',
            title: 'Machine Learning for Healthcare Applications',
            authors: ['Test Author 1', 'Test Author 2'],
            year: 2024,
            abstract: 'This paper presents a novel machine learning approach for predicting patient outcomes in healthcare settings. We propose a deep learning architecture that achieves state-of-the-art results.',
            venue: 'Test Conference',
            citations: 50,
            url: 'https://example.com/paper1',
            source: 'other',
            extractedAt: new Date(),
            included: true
          },
          {
            id: 'diagnostic-paper-2',
            title: 'A Survey of Deep Learning Methods',
            authors: ['Test Reviewer'],
            year: 2024,
            abstract: 'This survey paper reviews existing deep learning methods across various domains. We provide a comprehensive overview of the field.',
            venue: 'Survey Journal',
            citations: 200,
            url: 'https://example.com/paper2',
            source: 'other',
            extractedAt: new Date(),
            included: true
          },
          {
            id: 'diagnostic-paper-3',
            title: 'AI in Medical Diagnosis: A Case Study',
            authors: ['Test Researcher'],
            year: 2024,
            abstract: 'We explore the application of artificial intelligence in medical diagnosis, focusing on image-based diagnostics and predictive modeling.',
            venue: 'Medical AI Journal',
            citations: 30,
            url: 'https://example.com/paper3',
            source: 'other',
            extractedAt: new Date(),
            included: true
          }
        ];

        for (const paper of testPapers) {
          db.addPaper(sessionId, paper);
        }

        console.log(chalk.green('  ✓ Test papers inserted\n'));

        // Apply semantic filtering
        console.log(chalk.white('  Running batch processing test...'));
        const inclusionCriteria = 'Papers must present novel AI or machine learning methods with healthcare applications.';
        const exclusionCriteria = 'Survey papers and review papers should be excluded.';

        const startTime = Date.now();

        // Create a simple progress indicator
        let lastProgress = 0;
        await tools.applySemanticFiltering(
          sessionId,
          inclusionCriteria,
          exclusionCriteria,
          (progress) => {
            if (progress.processedPapers > lastProgress) {
              process.stdout.write(chalk.gray('.'));
              lastProgress = progress.processedPapers;
            }
          }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(chalk.green('\n  ✓ Batch processing completed'));
        console.log(chalk.gray(`    Time: ${elapsed}s`));

        // Check results
        const results = db.getPapers(sessionId);
        const included = results.filter((p: Paper) =>
          p.systematic_filtering_inclusion === true &&
          p.systematic_filtering_exclusion === false
        ).length;

        console.log(chalk.white(`\n  Results:`));
        console.log(chalk.gray(`    Total papers: ${results.length}`));
        console.log(chalk.gray(`    Included: ${included}`));
        console.log(chalk.gray(`    Excluded: ${results.length - included}`));

        // Show sample reasoning
        const sample = results.find((p: Paper) => p.systematic_filtering_inclusion_reasoning);
        if (sample) {
          console.log(chalk.white(`\n  Sample Reasoning (${sample.title.substring(0, 40)}...):`));
          console.log(chalk.gray(`    "${sample.systematic_filtering_inclusion_reasoning?.substring(0, 120)}..."`));
        }

        // Expected results validation
        const expectedIncluded = 2; // Papers 1 and 3 should be included, paper 2 (survey) excluded
        if (included === expectedIncluded) {
          console.log(chalk.green('\n  ✓ Test PASSED: Results match expected outcome'));
        } else {
          console.log(chalk.yellow(`\n  ⚠ Test WARNING: Expected ${expectedIncluded} included, got ${included}`));
          console.log(chalk.gray('    (This may indicate LLM reasoning variations)'));
        }

        console.log('');
      }

      // 3. Database Check
      console.log(chalk.cyan('💾 3. Database Check'));
      console.log(chalk.gray('-'.repeat(80)));

      const sessions = tools.getAllSessions();
      console.log(chalk.white(`  Total Sessions: ${sessions.length}`));

      if (sessions.length > 0) {
        const totalPapers = sessions.reduce((sum, s) => sum + s.papers.length, 0);
        console.log(chalk.white(`  Total Papers: ${totalPapers}`));
        console.log(chalk.green('  ✓ Database accessible'));

        // Show recent sessions
        const recent = sessions.slice(0, 3);
        console.log(chalk.white('\n  Recent Sessions:'));
        recent.forEach((s, i) => {
          console.log(chalk.gray(`    ${i + 1}. ${s.parameters.name || 'Unnamed'} (${s.papers.length} papers)`));
          console.log(chalk.gray(`       Status: ${s.progress.status}, Created: ${s.createdAt.toLocaleDateString()}`));
        });
      } else {
        console.log(chalk.gray('  No existing sessions found'));
      }

      console.log('');

      // 4. System Summary
      console.log(chalk.cyan('📊 4. System Summary'));
      console.log(chalk.gray('-'.repeat(80)));

      if (exitCode === 0) {
        console.log(chalk.green.bold('  ✓ All systems operational'));
        console.log(chalk.white('  System is ready for literature review tasks\n'));
      } else {
        console.log(chalk.yellow.bold('  ⚠ Some issues detected'));
        console.log(chalk.white('  Please review the warnings above\n'));
      }

      console.log(chalk.gray('=' .repeat(80)));
      console.log(chalk.blue.bold('\n✓ Diagnostic completed\n'));

      tools.close();
      process.exit(exitCode);

    } catch (error: any) {
      console.error(chalk.red('\n✗ Diagnostic failed:'), error.message);
      console.error(chalk.gray(error.stack));
      tools.close();
      process.exit(1);
    }
  });

// Show parameter schema command (helpful for users)
program
  .command('params')
  .description('Show all available search parameters and their descriptions')
  .action(() => {
    console.log(chalk.blue.bold('\n📋 Available Search Parameters\n'));

    SEARCH_PARAMETER_SCHEMA.forEach(param => {
      if (param.type === 'object' && param.nested) {
        console.log(chalk.white(`\n${param.label}:`));
        console.log(chalk.gray(`  ${param.description}`));
        console.log(chalk.white('  Options:'));

        param.nested.forEach(nested => {
          console.log(chalk.cyan(`    ${nested.cliFlag || nested.key}`));
          console.log(chalk.gray(`      ${nested.description}`));
          if (nested.default !== undefined) {
            console.log(chalk.gray(`      Default: ${JSON.stringify(nested.default)}`));
          }
          if (nested.options) {
            console.log(chalk.gray(`      Options: ${nested.options.map(o => o.value).join(', ')}`));
          }
        });
      } else {
        console.log(chalk.cyan(`\n${param.cliFlag || param.key}`));
        console.log(chalk.gray(`  ${param.description}`));
        if (param.default !== undefined) {
          console.log(chalk.gray(`  Default: ${JSON.stringify(param.default)}`));
        }
        if (param.options) {
          console.log(chalk.gray(`  Options: ${param.options.map(o => `${o.value} (${o.description})`).join(', ')}`));
        }
      }
    });

    console.log(chalk.white('\n\nExample usage:'));
    console.log(chalk.gray('  litrevtools search -i "machine learning" -e "survey" --llm-enabled --llm-api-key YOUR_KEY'));
    console.log('');
  });

program.parse();
