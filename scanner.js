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

function loadTsConfig(tsConfigPath) {
  try {
    const config = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    return ts.parseJsonConfigFileContent(config.config, ts.sys, "./");
  } catch (error) {
    console.warn(`Failed to load tsconfig.json: ${error.message}. Using default TypeScript configuration.`);
    return { options: {} };
  }
}

async function getTypeScriptFiles(dir, ignore) {
  return glob('**/*.ts', { cwd: dir, ignore, absolute: true });
}

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