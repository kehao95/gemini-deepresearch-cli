import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedPrompt } from './prompt.js';

const SCHEMA_VERSION = '1.0';

export interface SavedPromptSnapshot {
  text: string;
  source: 'argument' | 'stdin' | 'file';
  path?: string;
  sha256: string;
}

export interface InteractionRecord {
  id: string;
  command: 'run' | 'plan' | 'followup' | 'get';
  created_at: string;
  previous_interaction_id?: string;
  agent?: string;
  collaborative_planning?: boolean;
  visualization?: boolean;
  input_role?: 'query' | 'followup_message';
  input?: SavedPromptSnapshot;
  status?: string;
}

export interface InteractionMeta {
  schema_version: string;
  created_at: string;
  updated_at: string;
  query?: SavedPromptSnapshot;
  latest_interaction_id?: string;
  interactions: InteractionRecord[];
}

export interface MetaUpdate {
  id: string;
  command: InteractionRecord['command'];
  previousInteractionId?: string;
  agent?: string;
  collaborativePlanning?: boolean;
  visualization?: boolean;
  input?: ResolvedPrompt;
  inputRole?: InteractionRecord['input_role'];
  status?: string;
  now?: string;
}

export interface ReportBundleOpts {
  interactionId: string;
  reportText: string;
  meta?: InteractionMeta;
  generatedAt?: string;
}

export async function upsertMetaFile(
  targetPath: string,
  update: MetaUpdate,
): Promise<InteractionMeta> {
  const now = update.now ?? new Date().toISOString();
  const resolvedPath = path.resolve(targetPath);
  const existing = await readMetaFile(resolvedPath);

  const input = update.input ? snapshotPrompt(update.input) : undefined;
  const query =
    update.inputRole === 'query' && input
      ? input
      : existing?.query;

  const record: InteractionRecord = {
    id: update.id,
    command: update.command,
    created_at: now,
    previous_interaction_id: update.previousInteractionId,
    agent: update.agent,
    collaborative_planning: update.collaborativePlanning,
    visualization: update.visualization,
    input_role: update.inputRole,
    input,
    status: update.status,
  };

  const meta: InteractionMeta = {
    schema_version: SCHEMA_VERSION,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    query,
    latest_interaction_id: update.id,
    interactions: [...(existing?.interactions ?? []), record],
  };

  await writeJsonFile(resolvedPath, meta);
  return meta;
}

export async function readMetaFile(filePath: string): Promise<InteractionMeta | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as InteractionMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function writeBundleFile(
  targetPath: string,
  opts: ReportBundleOpts,
): Promise<void> {
  const resolvedPath = path.resolve(targetPath);
  const content = renderReportBundle(opts);
  await writeTextFile(resolvedPath, content);
}

export async function writeTextFile(
  targetPath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf-8');
}

export function renderQueryTemplate(title?: string): string {
  const topic = title?.trim() || 'Research Topic';

  return `# ${topic}

## Context
- What project, decision, paper, memo, or product work this research supports
- Why this question matters now

## Research Questions
1. Primary question the agent must answer
2. Secondary questions or comparisons to make
3. Uncertainties, disagreements, or risks to resolve

## Scope
- Time range:
- Geography or market:
- Entities to include:
- Explicit exclusions:

## Deliverables
- Executive summary
- Comparison table or structured breakdown
- Risks, uncertainties, and open questions
- Recommendation or decision frame

## Constraints
- Preferred source types:
- Evidence standards:
- What to avoid:
- How to label uncertainty or inference:

## Output Requirements
- Required structure:
- Citation style:
- Required tables / bullets / appendices:
`;
}

export function renderReportBundle(opts: ReportBundleOpts): string {
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const lines: string[] = [
    '# Deep Research Report Bundle',
    '',
    `- Generated at: ${generatedAt}`,
    `- Interaction ID: ${opts.interactionId}`,
  ];

  if (opts.meta?.query?.path) {
    lines.push(`- Query file: ${opts.meta.query.path}`);
  }
  if (opts.meta?.latest_interaction_id) {
    lines.push(`- Latest interaction ID in metadata: ${opts.meta.latest_interaction_id}`);
  }

  lines.push('', '## Query');

  if (opts.meta?.query?.text) {
    lines.push('', '```markdown', opts.meta.query.text, '```');
  } else {
    lines.push('', '_Query text unavailable. Use `--save-meta` during `dr plan` or `dr run` to preserve the originating brief._');
  }

  if (opts.meta?.interactions.length) {
    lines.push('', '## Interaction Log', '');
    for (const entry of opts.meta.interactions) {
      lines.push(
        `- ${entry.command} | id=${entry.id} | created_at=${entry.created_at}${entry.previous_interaction_id ? ` | previous=${entry.previous_interaction_id}` : ''}${entry.status ? ` | status=${entry.status}` : ''}`,
      );
    }
  }

  lines.push('', '## Final Report', '', opts.reportText.trim(), '');
  return lines.join('\n');
}

function snapshotPrompt(input: ResolvedPrompt): SavedPromptSnapshot {
  return {
    text: input.text,
    source: input.source,
    path: input.path,
    sha256: sha256(input.text),
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}
