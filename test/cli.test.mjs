import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'dist', 'index.js');

test('root help documents query quality and async workflow', () => {
  const result = spawnSync('node', [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Research query quality:/);
  assert.match(result.stdout, /dr init-query queries\/topic\.md/);
  assert.match(result.stdout, /--save-meta/);
});

test('init-query prints a usable template to stdout', () => {
  const result = spawnSync(
    'node',
    [cliPath, 'init-query', '-', '--title', 'AI Chip Market 2026'],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^# AI Chip Market 2026/m);
  assert.match(result.stdout, /^## Context$/m);
  assert.match(result.stdout, /^## Output Requirements$/m);
});

test('init-query writes a file and refuses overwrite without --force', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dr-init-query-'));
  const queryPath = path.join(tempDir, 'topic.md');

  const first = spawnSync('node', [cliPath, 'init-query', queryPath], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  assert.equal(first.status, 0);

  const content = await readFile(queryPath, 'utf-8');
  assert.match(content, /^# Research Topic/m);

  const second = spawnSync('node', [cliPath, 'init-query', queryPath], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  assert.equal(second.status, 2);
  assert.match(second.stderr, /Refusing to overwrite existing file/);
});
