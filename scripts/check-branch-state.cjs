#!/usr/bin/env node
/**
 * Guardrail: ensure branch-specific status notes mention the active branch.
 * Fails CI/local lint if docs/HANDOFF.md "Current State" heading does not
 * include the current git branch (or BRANCH_NAME override).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function readHeadRef() {
  const headPath = path.join('.git', 'HEAD');
  if (!fs.existsSync(headPath)) return null;

  const headContents = fs.readFileSync(headPath, 'utf8').trim();
  if (!headContents) return null;

  if (headContents.startsWith('ref:')) {
    const ref = headContents.split(' ')[1];
    return path.basename(ref);
  }

  return headContents;
}

function getBranchName() {
  if (process.env.BRANCH_NAME) return process.env.BRANCH_NAME;

  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    const fallback = readHeadRef();
    if (fallback) {
      console.warn(
        `git rev-parse failed (${error.message}); using HEAD ref "${fallback}" as branch name.`
      );
      return fallback;
    }
    throw new Error(
      `Failed to determine branch name (git rev-parse errored with: ${error.message}). Set BRANCH_NAME or ensure git is available.`
    );
  }
}

const branch = getBranchName();

function assertLineContains(line, value, context) {
  if (!line.includes(value)) {
    throw new Error(
      `${context} is missing active branch "${value}". Update the heading to include the branch + date.`
    );
  }
}

function findCurrentStateLine(contents) {
  return contents
    .split('\n')
    .find((line) => line.toLowerCase().startsWith('current state'));
}

const handoffPath = 'docs/HANDOFF.md';
const handoff = fs.readFileSync(handoffPath, 'utf8');
const currentStateLine = findCurrentStateLine(handoff);

if (!currentStateLine) {
  throw new Error(`Could not find "Current State" heading in ${handoffPath}`);
}

assertLineContains(
  currentStateLine,
  branch,
  `"${currentStateLine.trim()}" in ${handoffPath}`
);

console.log(
  `Branch context check passed: ${handoffPath} current state references "${branch}".`
);
