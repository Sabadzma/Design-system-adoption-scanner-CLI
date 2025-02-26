# Design system adoption scanner CLI

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Project Structure](#project-structure)
5. [Code Explanation](#code-explanation)
   - [index.js](#indexjs)
   - [scanner.js](#scannerjs)
   - [.github/workflows/ci.yml](#githubworkflowsciyml)
6. [Configuration](#configuration)
7. [Output](#output)
8. [Contributing](#contributing)
9. [License](#license)

## Introduction

The Angular Design System Adoption CLI is a powerful tool designed to analyze Angular projects and measure the adoption of design system components. It scans through TypeScript files, identifies components, and calculates adoption metrics based on the usage of design system elements versus custom components.

This tool is particularly useful for teams working on large Angular projects who want to track and improve their design system adoption over time.

## Installation

To install the Angular Design System Adoption CLI, follow these steps:

1. Clone the repository:

git clone [https://github.com/your-repo/angular-design-system-cli.git](https://github.com/your-repo/angular-design-system-cli.git)
cd angular-design-system-cli

```plaintext

2. Install dependencies:
```

npm install

```plaintext

3. Link the CLI globally (optional):
```

npm link

```plaintext

## Usage

To use the Angular Design System Adoption CLI, run the following command:

```

node index.js -p /path/to/angular/project -o report.json -c config.json -i

```plaintext

Or if you've linked it globally:

```

angular-design-system-cli -p /path/to/angular/project -o report.json -c config.json -i

```plaintext

Options:
- `-p, --path <path>`: Path to the Angular repository (required)
- `-o, --output <output>`: Output file path for the JSON report (optional)
- `-c, --config <config>`: Path to the configuration file (optional)
- `-i, --incremental`: Perform incremental scan (only changed files) (optional)

## Project Structure

The project consists of three main files:

1. `index.js`: The entry point of the CLI application.
2. `scanner.js`: Contains the core logic for scanning and analyzing Angular projects.
3. `.github/workflows/ci.yml`: GitHub Actions workflow for continuous integration.

## Code Explanation

### index.js

This file is the main entry point of the CLI application. It handles command-line arguments, configuration loading, and orchestrates the scanning process.

Key components:

1. **Imports**:
   ```javascript
   import { program } from 'commander';
   import { scanRepository } from './scanner.js';
   import path from 'path';
   import fs from 'fs/promises';
   import ora from 'ora';
   import Ajv from 'ajv';
```

- `commander`: Used for parsing command-line arguments.
- `scanner.js`: Contains the main scanning logic.
- `path` and `fs`: Node.js built-in modules for file system operations.
- `ora`: Provides elegant terminal spinners.
- `Ajv`: JSON Schema validator for configuration validation.


2. **Configuration Schema**:

```javascript
const configSchema = {
  type: 'object',
  properties: {
    designSystemPackages: { type: 'array', items: { type: 'string' } },
    ignore: { type: 'array', items: { type: 'string' } }
  },
  required: ['designSystemPackages', 'ignore']
};
```

This schema defines the structure of the configuration file, ensuring it contains the required properties.


3. **Command-line Interface Setup**:

```javascript
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
```

This sets up the CLI interface, defining the available options and providing help text.


4. **Path Validation**:

```javascript
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
```

This function ensures that the provided path exists and is a directory.


5. **Configuration Loading**:

```javascript
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
```

This function loads and validates the configuration file, falling back to default values if necessary.


6. **Main Execution Function**:

```javascript
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
```

This function orchestrates the entire process:

1. Validates the input path
2. Loads the configuration
3. Calls the `scanRepository` function from `scanner.js`
4. Adds metadata to the report
5. Outputs the report (to file or console)





### scanner.js

This file contains the core logic for scanning and analyzing Angular projects. It's responsible for traversing the file system, parsing TypeScript files, and calculating adoption metrics.

Key components:

1. **Imports and Constants**:

```javascript
import fs from 'fs/promises';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import glob from 'glob-promise';
import ts from 'typescript';
import { exec } from 'child_process';

const WEIGHTS = {
  designSystem: 1.0,
  custom: 0.75,
  htmlElement: 0.25,
  dynamicImport: 0.5
};
```

1. File system and path manipulation modules
2. Babel parser and traverse for AST analysis
3. glob for file matching
4. TypeScript compiler API for resolving imports
5. Child process for Git operations
6. WEIGHTS object for calculating weighted adoption scores



2. **File Change Detection**:

```javascript
async function getChangedFiles(repoPath) {
  try {
    await fs.access(path.join(repoPath, '.git'));
    return new Promise((resolve, reject) => {
      exec('git diff --name-only HEAD', { cwd: repoPath }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.trim().split('\n').filter(file => file.endsWith('.ts')));
      });
    });
  } catch {
    console.warn('Not a git repository or git not installed. Falling back to full scan.');
    return [];
  }
}
```

This function uses Git to detect changed files for incremental scanning.


3. **Parallel Processing**:

```javascript
async function parallelProcess(items, fn, limit = 10) {
  const batches = [];
  for (let i = 0; i < items.length; i += limit) {
    batches.push(items.slice(i, i + limit));
  }

  const results = [];
  for (const batch of batches) {
    results.push(...await Promise.all(batch.map(fn)));
  }

  return results;
}
```

This function enables parallel processing of files, improving performance for large projects.


4. **Main Scanning Function**:

```javascript
export async function scanRepository(repoPath, config, incremental = false) {
  const tsConfigPath = path.join(repoPath, 'tsconfig.json');
  const tsConfig = loadTsConfig(tsConfigPath);
  
  let files;
  if (incremental) {
    files = await getChangedFiles(repoPath);
    if (files.length === 0) {
      files = await getTypeScriptFiles(repoPath, config.ignore);
    }
  } else {
    files = await getTypeScriptFiles(repoPath, config.ignore);
  }

  const components = await parallelProcess(files, file => analyzeFile(file, tsConfig, config));
  
  const flatComponents = components.flat();
  const designSystemComponents = flatComponents.filter(c => c.isDesignSystem);
  const customComponents = flatComponents.filter(c => !c.isDesignSystem);
  
  const totalComponents = flatComponents.length;
  
  const weightedScore = flatComponents.reduce((sum, c) => {
    const weight = c.isDesignSystem
      ? WEIGHTS.designSystem
      : c.isDynamicImport
      ? WEIGHTS.dynamicImport
      : c.viaComposition
      ? (WEIGHTS.custom + WEIGHTS.designSystem) / 2
      : WEIGHTS.custom;
    return sum + weight;
  }, 0);

  const maxScore = totalComponents * WEIGHTS.designSystem;
  const adoptionPercentage = (weightedScore / maxScore) * 100;

  return {
    summary: {
      designSystemComponents: designSystemComponents.length,
      customComponents: customComponents.length,
      totalComponents,
      adoptionPercentage: Math.round(adoptionPercentage * 100) / 100,
      weightedScore: Math.round(weightedScore * 100) / 100,
      maxScore: Math.round(maxScore * 100) / 100
    },
    components: flatComponents
  };
}
```

This is the main entry point for scanning. It:

1. Loads the TypeScript configuration
2. Determines which files to scan (all or only changed)
3. Processes files in parallel
4. Calculates adoption metrics



5. **File Analysis**:

```javascript
async function analyzeFile(filePath, tsConfig, config) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy']
    });

    const components = [];
    let usesDesignSystem = false;

    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        const resolvedSource = resolveImport(source, filePath, tsConfig);
        if (config.designSystemPackages.some(pkg => resolvedSource.startsWith(pkg))) {
          usesDesignSystem = true;
          path.node.specifiers.forEach(specifier => {
            if (specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier') {
              components.push({
                name: specifier.local.name,
                isDesignSystem: true,
                source: resolvedSource,
                filePath,
                usage: { inline: 0, external: 0 }
              });
            }
          });
        }
      },
      ClassDeclaration(path) {
        const decorator = path.node.decorators?.find(d => 
          d.expression.callee?.name === 'Component' || 
          d.expression.callee?.property?.name === 'Component'
        );
        if (decorator) {
          const props = decorator.expression.arguments[0].properties;
          const selector = props.find(p => p.key.name === 'selector')?.value.value;
          const templateProp = props.find(p => p.key.name === 'template' || p.key.name === 'templateUrl');
          const isInlineTemplate = templateProp?.key.name === 'template';
          
          components.push({
            name: path.node.id.name,
            selector,
            isDesignSystem: false,
            source: 'custom',
            filePath,
            viaComposition: usesDesignSystem,
            usage: {
              inline: isInlineTemplate ? 1 : 0,
              external: isInlineTemplate ? 0 : 1
            }
          });
        }
      },
      CallExpression(path) {
        if (path.node.callee.name === 'loadChildren') {
          components.push({
            name: 'lazy-loaded',
            isDesignSystem: false,
            source: path.node.arguments[0].value,
            filePath,
            isDynamicImport: true
          });
        }
      }
    });

    return components;
  } catch (error) {
    console.warn(`Failed to analyze ${filePath}: ${error.message}`);
    return [];
  }
}
```

This function analyzes individual TypeScript files:

1. Parses the file into an AST
2. Traverses the AST to find component declarations and imports
3. Classifies components as design system or custom
4. Tracks component composition (custom components using design system elements)



6. **Import Resolution**:

```javascript
function resolveImport(importPath, filePath, tsConfig) {
  if (importPath.startsWith('.')) {
    return path.resolve(path.dirname(filePath), importPath);
  }
  const resolvedModule = ts.resolveModuleName(
    importPath,
    filePath,
    tsConfig.options,
    ts.sys
  );
  return resolvedModule.resolvedModule?.resolvedFileName || importPath;
}
```

This function resolves import paths, handling both relative imports and aliased imports defined in tsconfig.json.




### .github/workflows/ci.yml

This file defines a GitHub Actions workflow for continuous integration:

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps: 

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '14'
      - name: Install Dependencies
        run: npm ci
```

This workflow:

- Triggers on push and pull request events
- Uses Ubuntu as the runner
- Checks out the code
- Sets up Node.js version 14
- Installs dependencies using `npm ci`


## Configuration

The tool accepts a configuration file with the following structure:

```json
{
  "designSystemPackages": ["@ui-kit", "@ds"],
  "ignore": ["**/*.spec.ts", "**/*.stories.ts"]
}
```

- `designSystemPackages`: An array of package names that are considered part of the design system.
- `ignore`: An array of glob patterns for files to ignore during scanning.


## Output

The tool generates a JSON report with the following structure:

```json
{
  "metadata": {
    "timestamp": "2023-05-20T12:34:56.789Z",
    "repoPath": "/path/to/angular/project",
    "incremental": false
  },
  "summary": {
    "designSystemComponents": 120,
    "customComponents": 80,
    "totalComponents": 200,
    "adoptionPercentage": 60,
    "weightedScore": 150,
    "maxScore": 200
  },
  "components": [
    {
      "name": "ButtonComponent",
      "isDesignSystem": true,
      "source": "@ui-kit/button",
      "filePath": "/path/to/file.ts",
      "usage": { "inline": 0, "external": 1 }
    },
    // ... more components
  ]
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
