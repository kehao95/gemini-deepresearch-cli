import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  renderReportBundle,
  upsertMetaFile,
} from '../dist/workflow.js';

test('upsertMetaFile preserves the query and appends followups', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dr-meta-'));
  const metaPath = path.join(tempDir, 'topic.meta.json');

  await upsertMetaFile(metaPath, {
    id: 'plan-123',
    command: 'plan',
    agent: 'deep-research-preview-04-2026',
    collaborativePlanning: true,
    inputRole: 'query',
    input: {
      text: '# Context\nTest query',
      source: 'file',
      path: '/tmp/query.md',
    },
    now: '2026-04-26T12:00:00.000Z',
  });

  const updated = await upsertMetaFile(metaPath, {
    id: 'followup-456',
    command: 'followup',
    previousInteractionId: 'plan-123',
    inputRole: 'followup_message',
    input: {
      text: 'Looks good. Execute the plan.',
      source: 'argument',
    },
    now: '2026-04-26T12:05:00.000Z',
  });

  assert.equal(updated.latest_interaction_id, 'followup-456');
  assert.equal(updated.query?.text, '# Context\nTest query');
  assert.equal(updated.interactions.length, 2);
  assert.equal(updated.interactions[1].previous_interaction_id, 'plan-123');

  const saved = JSON.parse(await readFile(metaPath, 'utf-8'));
  assert.equal(saved.interactions.length, 2);
});

test('renderReportBundle merges query, interaction log, and report text', () => {
  const bundle = renderReportBundle({
    interactionId: 'run-789',
    reportText: 'Final report body',
    meta: {
      schema_version: '1.0',
      created_at: '2026-04-26T12:00:00.000Z',
      updated_at: '2026-04-26T12:10:00.000Z',
      latest_interaction_id: 'run-789',
      query: {
        text: '# Context\nQuery body',
        source: 'file',
        path: '/tmp/query.md',
        sha256: 'abc',
      },
      interactions: [
        {
          id: 'plan-123',
          command: 'plan',
          created_at: '2026-04-26T12:00:00.000Z',
        },
        {
          id: 'run-789',
          command: 'followup',
          created_at: '2026-04-26T12:08:00.000Z',
          previous_interaction_id: 'plan-123',
        },
      ],
    },
    generatedAt: '2026-04-26T12:10:00.000Z',
  });

  assert.match(bundle, /^# Deep Research Report Bundle/m);
  assert.match(bundle, /## Query/);
  assert.match(bundle, /Query body/);
  assert.match(bundle, /## Interaction Log/);
  assert.match(bundle, /run-789/);
  assert.match(bundle, /## Final Report/);
  assert.match(bundle, /Final report body/);
});
