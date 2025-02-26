#!/usr/bin/env node

import { program } from 'commander';
import { scanRepository } from './scanner.js';
import path from 'path';
import fs from 'fs/promises';
import ora from 'ora';
import Ajv from 'ajv';

const configSchema = {
  type: 'object',
  properties: {
    designSystemPackages: { type: 'array', items: { type: 'string' } },
    ignore: { type: 'array', items: { type: 'string' } }
  },
  required: ['designSystemPackages', 'ignore']
};

const ajv = new Ajv();
const validateConfig = ajv.compile(configSchema);

const DEFAULT_CONFIG = {
  designSystemPackages: ['@ui-kit', '@ds'],
  ignore: ['**/*.spec.ts', '**/*.stories.ts']
};

program
  .version('1.0.2')
  .description('Angular Design System Adoption Tracker')
  .option('-p, --path <path>', 'Path to the Angular repository')
  .option('-o, --output <output>', 'Output file path for the JSON report')
  .option('-c, --config <config>', 'Path to the configuration file')
  .option('-i, --incremental', 'Perform incremental scan (only changed files)')
  .helpOption('-h, --help', 'Display help for command')
  .addHelpText('after', `
Example usage:
  $ node index.js -p /path/to/angular/project -o report.json -c config.json -i
  `)
  .parse(process.argv);

const options = program.opts();

if (!options.path) {
  handleError(new Error('Please provide a path to the repository using the -p or --path option'));
}

async function validatePath(path) {
  try {
    const stats = await fs.stat(path);
    if (!stats.isDirectory()) {
      throw new Error('The provided path is not a directory');
    }
  } catch (error) {
    throw new Error(`Invalid path: ${error.message}`);
  }
}

async function loadConfig(configPath) {
  try {
    const configFile = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configFile);
    if (!validateConfig(config)) {
      throw new Error(`Invalid configuration: ${ajv.errorsText(validateConfig.errors)}`);
    }
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.warn(`Failed to load config: ${error.message}. Using default configuration.`);
    return DEFAULT_CONFIG;
  }
}

function handleError(error, context = '') {
  console.error(`\n❌ Error: ${context}\n${error.stack || error.message}`);
  process.exit(1);
}

async function run() {
  const spinner = ora('Initializing...').start();
  try {
    await validatePath(options.path);

    let config = DEFAULT_CONFIG;
    if (options.config) {
      const configPath = path.resolve(process.cwd(), options.config);
      config = await loadConfig(configPath);
    }

    spinner.text = 'Scanning repository...';
    const report = await scanRepository(options.path, config, options.incremental);
    spinner.succeed('Scan complete');
    
    const finalReport = {
      metadata: {
        timestamp: new Date().toISOString(),
        repoPath: options.path,
        incremental: options.incremental || false
      },
      ...report
    };

    if (options.output) {
      const outputPath = path.resolve(process.cwd(), options.output);
      await fs.writeFile(outputPath, JSON.stringify(finalReport, null, 2));
      console.log(`Report saved to ${outputPath}`);
    } else {
      console.log(JSON.stringify(finalReport, null, 2));
    }
  } catch (error) {
    spinner.fail('An error occurred');
    handleError(error, 'Error during repository scan');
  }
}

run();