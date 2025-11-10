#!/usr/bin/env node

/**
 * CLI Platform for LitRevTools
 */

import { Command } from 'commander';
import { LitRevTools, SearchParameters, SearchProgress, Paper } from '../../core';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import * as readline from 'readline';

const program = new Command();

program
  .name('litrevtools')
  .description('Systematic Literature Review Tool using PRISMA methodology')
  .version('1.0.0');

// Search command
program
  .command('search')
  .description('Start a new literature review search')
  .option('-n, --name <name>', 'Name of the search')
  .option('-i, --include <keywords...>', 'Inclusion keywords', ['large language model', 'mathematical reasoning'])
  .option('-e, --exclude <keywords...>', 'Exclusion keywords', ['survey', 'review'])
  .option('-m, --max <number>', 'Maximum number of results', parseInt)
  .option('--start-year <year>', 'Start year for search', parseInt)
  .option('--end-year <year>', 'End year for search', parseInt)
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('\n🔍 LitRevTools - Systematic Literature Review\n'));

      // Get search parameters interactively if not provided
      const params = await getSearchParameters(options);

      console.log(chalk.green('\n✓ Starting search with parameters:'));
      console.log(chalk.gray(`  Name: ${params.name || 'Auto-generated'}`));
      console.log(chalk.gray(`  Include: ${params.inclusionKeywords.join(', ')}`));
      console.log(chalk.gray(`  Exclude: ${params.exclusionKeywords.join(', ')}`));
      console.log(chalk.gray(`  Max results: ${params.maxResults || 'Unlimited'}`));
      console.log(chalk.gray(`  Year range: ${params.startYear || 'N/A'} - ${params.endYear || 'Current'}\n`));

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
      const sessionId = await tools.startSearch(params, {
        onProgress: (progress: SearchProgress) => {
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
            tools.generateOutputs(sessionId).then(() => {
              const session = tools.getSession(sessionId);
              if (session?.outputs) {
                console.log(chalk.green('\n✓ Outputs generated:'));
                if (session.outputs.csv) console.log(chalk.gray(`  CSV: ${session.outputs.csv}`));
                if (session.outputs.bibtex) console.log(chalk.gray(`  BibTeX: ${session.outputs.bibtex}`));
                if (session.outputs.latex) console.log(chalk.gray(`  LaTeX: ${session.outputs.latex}`));
                if (session.outputs.zip) console.log(chalk.gray(`  ZIP: ${session.outputs.zip}`));
              }

              console.log(chalk.blue.bold(`\nSession ID: ${sessionId}\n`));
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
        onPaper: (paper: Paper) => {
          papersFound++;
          if (papersFound % 10 === 0) {
            console.log(chalk.gray(`\n  Found: ${paper.title.substring(0, 60)}...`));
          }
        },
        onError: (error: Error) => {
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

// Interactive helper
async function getSearchParameters(options: any): Promise<SearchParameters> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => rl.question(query, resolve));
  };

  let params: SearchParameters = {
    name: options.name,
    inclusionKeywords: options.include || [],
    exclusionKeywords: options.exclude || [],
    maxResults: options.max,
    startYear: options.startYear,
    endYear: options.endYear
  };

  // If no inclusion keywords provided, ask
  if (params.inclusionKeywords.length === 0) {
    console.log(chalk.yellow('Enter inclusion keywords (comma-separated):'));
    console.log(chalk.gray('Default suggestions: large language model, mathematical reasoning'));
    const input = await question('> ');
    params.inclusionKeywords = input.trim()
      ? input.split(',').map(k => k.trim())
      : ['large language model', 'mathematical reasoning'];
  }

  // If no exclusion keywords provided, ask
  if (params.exclusionKeywords.length === 0) {
    console.log(chalk.yellow('\nEnter exclusion keywords (comma-separated):'));
    console.log(chalk.gray('Default suggestions: survey, review'));
    const input = await question('> ');
    params.exclusionKeywords = input.trim()
      ? input.split(',').map(k => k.trim())
      : ['survey', 'review'];
  }

  rl.close();
  return params;
}

program.parse();
