#!/usr/bin/env node

/**
 * Build obfuscated JavaScript into `dist/` while preserving relative paths.
 * Config comes from `obfuscator.config.js` at the repo root.
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const copyFileNative = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);

const obfuscatorConfig = require('../obfuscator.config.js');

const REPO_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(REPO_ROOT, 'dist');

const CONFIG = {
  sourceRoots: ['src', 'operators'],
  rootFiles: [],
  skipDirNames: [
    'node_modules',
    'dist',
    'logs',
    'temp',
    'uploads',
    '__tests__',
    'samples',
    '.git',
    'coverage',
    'dev-playground',
  ],
  copyDirNames: [],
  skipFileSuffixes: ['.test.js', '.spec.js'],
  skipFileExtensions: ['.map'],
  entryFiles: ['src/index.js'],
};

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function shouldSkipFile(fileName) {
  if (CONFIG.skipFileExtensions.some((ext) => fileName.endsWith(ext))) {
    return true;
  }
  if (CONFIG.skipFileSuffixes.some((suffix) => fileName.endsWith(suffix))) {
    return true;
  }
  return false;
}

function isUnderCopyDir(relativePath) {
  return relativePath.split(path.sep).some((part) => CONFIG.copyDirNames.includes(part));
}

async function collectFiles(dir, fileList = []) {
  const files = await readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      if (CONFIG.skipDirNames.includes(file)) {
        continue;
      }
      await collectFiles(filePath, fileList);
    } else if (!shouldSkipFile(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function obfuscateFile(filePath, relativePath) {
  const code = await readFile(filePath, 'utf8');
  const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscatorConfig);
  const distPath = path.join(DIST_DIR, relativePath);
  await mkdir(path.dirname(distPath), { recursive: true });
  await writeFile(distPath, obfuscationResult.getObfuscatedCode(), 'utf8');
  console.log(`OK obfuscated: ${toPosix(relativePath)}`);
}

async function copyFile(src, dest, relativePath) {
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFileNative(src, dest);
  console.log(`OK copied: ${toPosix(relativePath)}`);
}

async function gatherSourceFiles() {
  const sourceFiles = [];
  for (const root of CONFIG.sourceRoots) {
    const absRoot = path.join(REPO_ROOT, root);
    if (!fs.existsSync(absRoot)) {
      throw new Error(`Source root missing: ${root}`);
    }
    await collectFiles(absRoot, sourceFiles);
  }
  for (const file of CONFIG.rootFiles) {
    const absFile = path.join(REPO_ROOT, file);
    if (!fs.existsSync(absFile)) {
      throw new Error(`Root file missing: ${file}`);
    }
    sourceFiles.push(absFile);
  }
  return sourceFiles;
}

async function main() {
  console.log('Starting obfuscation build...\n');

  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  await mkdir(DIST_DIR, { recursive: true });

  const sourceFiles = await gatherSourceFiles();
  const obfuscateTargets = sourceFiles.filter((file) => {
    const relativePath = path.relative(REPO_ROOT, file);
    return file.endsWith('.js') && !isUnderCopyDir(relativePath);
  });
  console.log(`Found ${obfuscateTargets.length} JavaScript file(s) to obfuscate\n`);

  for (const file of sourceFiles) {
    const relativePath = path.relative(REPO_ROOT, file);
    if (file.endsWith('.js') && !isUnderCopyDir(relativePath)) {
      await obfuscateFile(file, relativePath);
    } else {
      await copyFile(file, path.join(DIST_DIR, relativePath), relativePath);
    }
  }

  const outputFiles = await collectFiles(DIST_DIR);
  const outputJsCount = outputFiles.filter((file) => {
    const relativePath = path.relative(DIST_DIR, file);
    return file.endsWith('.js') && !isUnderCopyDir(relativePath);
  }).length;
  if (obfuscateTargets.length === 0 || outputJsCount !== obfuscateTargets.length) {
    throw new Error(
      `Incomplete obfuscation output: expected ${obfuscateTargets.length} JS files, got ${outputJsCount}`
    );
  }

  for (const entry of CONFIG.entryFiles) {
    const entryPath = path.join(DIST_DIR, entry);
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Obfuscated entrypoint dist/${toPosix(entry)} is missing`);
    }
  }

  console.log('\nOK obfuscation build finished.');
  console.log(`Output: ${DIST_DIR}`);
}

main().catch((error) => {
  console.error('Obfuscation build failed:', error);
  process.exitCode = 1;
});
