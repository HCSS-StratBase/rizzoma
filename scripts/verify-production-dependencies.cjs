#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || process.cwd());
const lockPath = path.join(root, 'package-lock.json');
const modulesPath = path.join(root, 'node_modules');

const fail = (message) => {
  process.stderr.write(`[verify-production-dependencies] ${message}\n`);
  process.exit(1);
};

if (!fs.existsSync(lockPath)) fail(`missing lockfile: ${lockPath}`);
if (!fs.existsSync(modulesPath)) fail(`missing node_modules: ${modulesPath}`);

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages;
if (!packages || typeof packages !== 'object') fail('package-lock.json has no packages map');

const mismatches = [];
let checked = 0;

function inspectPackage(packageDir, lockKey) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    mismatches.push(`${lockKey}: installed package has no package.json`);
    return;
  }

  const installed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const expected = packages[lockKey];
  if (!expected) {
    mismatches.push(`${lockKey}: installed package is absent from package-lock.json`);
  } else if (expected.version && installed.version !== expected.version) {
    mismatches.push(`${lockKey}: lock=${expected.version} installed=${installed.version || 'missing'}`);
  }
  checked += 1;

  const nestedModules = path.join(packageDir, 'node_modules');
  if (fs.existsSync(nestedModules)) inspectNodeModules(nestedModules, `${lockKey}/node_modules`);
}

function inspectNodeModules(nodeModulesDir, lockPrefix) {
  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name.startsWith('.package-lock')) continue;
    const entryPath = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const scoped of fs.readdirSync(entryPath, { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue;
        inspectPackage(
          path.join(entryPath, scoped.name),
          `${lockPrefix}/${entry.name}/${scoped.name}`,
        );
      }
      continue;
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    inspectPackage(entryPath, `${lockPrefix}/${entry.name}`);
  }
}

inspectNodeModules(modulesPath, 'node_modules');

if (mismatches.length) {
  fail(`installed tree diverges from lockfile:\n${mismatches.join('\n')}`);
}
process.stdout.write(`[verify-production-dependencies] ${checked} installed package versions match package-lock.json\n`);
