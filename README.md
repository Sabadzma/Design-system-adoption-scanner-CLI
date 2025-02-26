# Design System Adoption Scanner CLI

## Table of Contents

1.  Introduction (#introduction)
    
2.  Installation (#installation)
    
3.  Usage (#usage)
    
4.  Project Structure (#project-structure)
    
5.  Code Explanation (#code-explanation)
    
    -   index.js (#indexjs)
        
    -   scanner.js (#scannerjs)
        
    -   .github/workflows/ci.yml (#githubworkflowsciyml)
        
6.  Configuration (#configuration)
    
7.  Output (#output)
    
8.  Contributing (#contributing)
    
9.  License (#license)
    

## Introduction

The Design System Adoption Scanner CLI is a powerful tool designed to analyze Angular projects and measure the adoption of design system components. It scans TypeScript files, identifies components, and calculates adoption metrics based on the usage of design system elements versus custom components.

This tool is particularly useful for teams working on large Angular projects who want to track and improve their design system adoption over time.

## Installation

To install the Design System Adoption Scanner CLI, follow these steps:

**1.  Clone the repository:**
    
    ```bash
    git clone https://github.com/Sabadzma/Design-system-adoption-scanner-CLI.git
    cd Design-system-adoption-scanner-CLI
    ```
    
  **2.  Install dependencies:**
    
    ```bash
    npm install
    ```
    
**3.  Link the CLI globally (optional):**
    
    ```bash
    npm link
    ```
    

**Usage**

To use the Design System Adoption Scanner CLI, run the following command:

```bash
node index.js -p /path/to/angular/project -o report.json -c config.json -i
```

Or, if you've linked it globally:


```bash
design-system-adoption-scanner-cli -p /path/to/angular/project -o report.json -c config.json -i
```

**Options**

-   -p, --path <path>: Path to the Angular repository (required)
    
-   -o, --output <output>: Output file path for the JSON report (optional)
    
-   -c, --config <config>: Path to the configuration file (optional)
    
-   -i, --incremental: Perform incremental scan (only changed files) (optional)
    

## Project Structure

The project consists of three main files:

1.  index.js: The entry point of the CLI application.
    
2.  scanner.js: Contains the core logic for scanning and analyzing Angular projects.
    
3.  .github/workflows/ci.yml: GitHub Actions workflow for continuous integration.
    

## Code Explanation

### index.js

This file serves as the main entry point of the CLI application. It handles command-line arguments, configuration loading, and orchestrates the scanning process.

**Key Components**

**1.  Imports:**
    
    ```javascript
    import { program } from 'commander';
    import { scanRepository } from './scanner.js';
    import path from 'path';
    import fs from 'fs/promises';
    import ora from 'ora';
    import Ajv from 'ajv';
    ```
    
    -   commander: Parses command-line arguments.
        
    -   scanner.js: Provides the scanning logic.
        
    -   path and fs: Handle file system operations.
        
    -   ora: Displays terminal spinners.
        
    -   Ajv: Validates JSON configuration.
        
**2.  Configuration Schema:**
    
    
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
    
    Ensures the configuration file has the required structure.
    
**3.  Command-line Interface Setup:**
    
    ```javascript
    program
      .version('1.0.2')
      .description('Design System Adoption Scanner CLI')
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
    
    Defines CLI options and provides usage examples.
    
4.  Main Execution Function:
    
    -   Validates the input path.
        
    -   Loads the configuration (or uses defaults).
        
    -   Executes the scan via scanRepository.
        
    -   Outputs the report (to a file or console).
        

scanner.js

This file contains the core logic for scanning and analyzing Angular projects. It traverses the file system, parses TypeScript files, and calculates adoption metrics.

Key Components

1.  Imports and Constants:
    
    javascript
    
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
    
    Defines weights for adoption scoring.
    
2.  Main Scanning Function:
    
    -   Loads the TypeScript configuration.
        
    -   Scans all files or only changed ones (incremental mode).
        
    -   Processes files in parallel for performance.
        
    -   Calculates adoption metrics (e.g., percentage of design system usage).
        
3.  File Analysis:
    
    -   Parses TypeScript files into an Abstract Syntax Tree (AST).
        
    -   Identifies imports and component declarations.
        
    -   Classifies components as design system or custom.
        

.github/workflows/ci.yml

This file defines a GitHub Actions workflow for continuous integration:

yaml

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

-   Triggers on push and pull requests.
    
-   Runs on Ubuntu with Node.js 14.
    
-   Installs dependencies.
    

Configuration

The tool uses a configuration file with this structure:

json

```json
{
  "designSystemPackages": ["@ui-kit", "@ds"],
  "ignore": ["**/*.spec.ts", "**/*.stories.ts"]
}
```

-   designSystemPackages: Array of design system package names.
    
-   ignore: Glob patterns for files to exclude.
    

Output

The tool generates a JSON report like this:

json

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
    }
  ]
}
```

Contributing

Contributions are welcome! Please submit issues or pull requests to enhance the tool.

License

This project is licensed under the MIT License.
