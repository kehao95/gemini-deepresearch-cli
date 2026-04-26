#!/usr/bin/env node

import { access } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import {
  createInteraction,
  getInteraction,
  pollUntilDone,
  printOutputs,
  renderOutputs,
  resolveAgent,
  streamInteraction,
} from './api.js';
import * as out from './output.js';
import {
  UsageError,
  resolvePromptInput,
  type ResolvedPrompt,
} from './prompt.js';
import {
  readMetaFile,
  renderQueryTemplate,
  upsertMetaFile,
  writeBundleFile,
  writeTextFile,
} from './workflow.js';

const program = new Command();

interface RunOptions {
  stream?: boolean;
  detach?: boolean;
  max?: boolean;
  visualize?: boolean;
  queryFile?: string;
  saveMeta?: string;
}

interface PlanOptions {
  stream?: boolean;
  detach?: boolean;
  max?: boolean;
  queryFile?: string;
  saveMeta?: string;
}

interface FollowupOptions {
  plan?: boolean;
  stream?: boolean;
  max?: boolean;
  messageFile?: string;
  saveMeta?: string;
}

interface GetOptions {
  wait?: boolean;
  json?: boolean;
  output?: string;
  bundle?: string;
  metaFile?: string;
  saveMeta?: string;
}

interface InitQueryOptions {
  title?: string;
  force?: boolean;
}

program
  .name('dr')
  .description('CLI for Google Gemini Deep Research Agent')
  .version('0.1.1')
  .addHelpText(
    'after',
    `
Environment:
  GEMINI_API_KEY    Gemini API key (required)
  GOOGLE_API_KEY    Alternative API key variable
  NO_COLOR          Disable colored output when set

Research query quality:
  Use a full agent-facing research brief, not keywords or a one-line chat question.
  Include context, the exact research question, scope, deliverables, constraints,
  and output requirements.
  Prefer saving queries to files and piping them to the CLI.
  Suggested skeleton:
    # Context
    # Research questions
    # Scope
    # Deliverables
    # Constraints
    # Output requirements

Workflow:
  Best practice for serious work:
    dr init-query queries/topic.md
    → fill in the brief
    → dr plan --query-file queries/topic.md --save-meta runs/topic.meta.json
    → revise with dr followup <id> --plan
    → approve/execute
    → dr get --meta-file runs/topic.meta.json --wait --bundle reports/topic.bundle.md
  Shortcut:
    dr run --query-file queries/topic.md

Examples:
  $ dr init-query queries/ai-chip-market-2026.md --title "AI Chip Market 2026"
  $ dr plan --query-file queries/ai-chip-market-2026.md --save-meta runs/ai-chip.meta.json
  $ dr run --query-file queries/ai-chip-market-2026.md --stream
  $ dr followup <id> "Focus more on hardware" --plan
  $ dr get --meta-file runs/ai-chip.meta.json --wait --bundle reports/ai-chip.bundle.md
`,
  );

// ────────────────────────── dr init-query ──────────────────────────

program
  .command('init-query')
  .description('Create a research query template')
  .argument('[path]', 'file to create; omit or use "-" to print to stdout')
  .option('--title <title>', 'title used in the template heading')
  .option('--force', 'overwrite an existing file')
  .addHelpText(
    'after',
    `
Examples:
  $ dr init-query queries/ai-chip-market-2026.md --title "AI Chip Market 2026"
  $ dr init-query - --title "Benchmark Audit"
`,
  )
  .action(async (targetPath: string | undefined, opts: InitQueryOptions) => {
    const content = ensureTrailingNewline(renderQueryTemplate(opts.title));

    if (!targetPath || targetPath === '-') {
      process.stdout.write(content);
      return;
    }

    const resolvedPath = path.resolve(targetPath);
    if (!opts.force) {
      await assertDoesNotExist(resolvedPath);
    }

    await writeTextFile(resolvedPath, content);
    out.success(`Wrote query template: ${resolvedPath}`);
  });

// ────────────────────────── dr run ──────────────────────────

program
  .command('run')
  .description('Start research from a full query brief and wait for the report')
  .argument('[prompt]', 'research query / agent brief (reads stdin when omitted or "-")')
  .option('--query-file <path>', 'read the research brief from a file')
  .option('--save-meta <path>', 'save interaction metadata and the originating query')
  .option('--stream', 'stream results in real-time')
  .option('--detach', 'print interaction ID and exit immediately')
  .option('--max', 'use the deep-research-max model for maximum depth')
  .option('--visualize', 'enable charts and graphs in the report')
  .addHelpText(
    'after',
    `
Query guidance:
  Deep Research expects a full research brief, not a keyword string.
  Good queries usually include context, research questions, scope, deliverables,
  constraints, and output requirements.
  Simple skeleton: Context → Research questions → Scope → Deliverables
  → Constraints → Output requirements

Examples:
  $ dr run --query-file queries/ai-chip-market-2026.md
  $ dr run --query-file queries/ai-chip-market-2026.md --stream --max
  $ dr run --query-file queries/market-analysis.md --visualize --save-meta runs/market.meta.json
  $ cat queries/topic.md | dr run --save-meta runs/topic.meta.json -
`,
  )
  .action(async (prompt: string | undefined, opts: RunOptions) => {
    const input = await resolvePromptInput({
      prompt,
      queryFile: opts.queryFile,
    });
    const agent = resolveAgent(opts.max);

    if (opts.stream) {
      let metaSaved = false;
      await streamInteraction({
        input: input.text,
        agent,
        visualization: opts.visualize,
        onInteractionStart: async (interactionId) => {
          if (!opts.saveMeta || metaSaved) return;
          await saveMeta(opts.saveMeta, {
            id: interactionId,
            command: 'run',
            agent,
            visualization: opts.visualize,
            input,
            inputRole: 'query',
          });
          metaSaved = true;
        },
      });
      return;
    }

    const interaction = await createInteraction({
      input: input.text,
      agent,
      visualization: opts.visualize,
    });
    out.interactionId(interaction.id);
    await saveMeta(opts.saveMeta, {
      id: interaction.id,
      command: 'run',
      agent,
      visualization: opts.visualize,
      input,
      inputRole: 'query',
    });

    if (opts.detach) {
      out.info('Detached. Use `dr get <id>` to check status.');
      return;
    }

    const result = await pollUntilDone(interaction.id);
    printOutputs(result.outputs);
    process.stdout.write('\n');
  });

// ────────────────────────── dr plan ──────────────────────────

program
  .command('plan')
  .description('Request a research plan for review before execution')
  .argument('[prompt]', 'research query / agent brief (reads stdin when omitted or "-")')
  .option('--query-file <path>', 'read the research brief from a file')
  .option('--save-meta <path>', 'save interaction metadata and the originating query')
  .option('--stream', 'stream the plan in real-time')
  .option('--detach', 'print interaction ID and exit immediately')
  .option('--max', 'use the deep-research-max model')
  .addHelpText(
    'after',
    `
Best practice:
  Use plan mode for serious async research.
  Save the query to a file, save the returned plan, and record the interaction ID
  so you can revise or approve it later.
  Query skeleton: Context → Research questions → Scope → Deliverables
  → Constraints → Output requirements

After receiving a plan you can:
  $ dr followup <id> "Add a section on costs" --plan   # revise
  $ dr followup <id> "Looks good"                      # approve & execute

Examples:
  $ dr plan --query-file queries/quantum-hardware.md --save-meta runs/quantum.meta.json
  $ dr plan --query-file queries/ev-battery-landscape.md --stream
`,
  )
  .action(async (prompt: string | undefined, opts: PlanOptions) => {
    const input = await resolvePromptInput({
      prompt,
      queryFile: opts.queryFile,
    });
    const agent = resolveAgent(opts.max);

    if (opts.stream) {
      let metaSaved = false;
      const id = await streamInteraction({
        input: input.text,
        agent,
        collaborativePlanning: true,
        onInteractionStart: async (interactionId) => {
          if (!opts.saveMeta || metaSaved) return;
          await saveMeta(opts.saveMeta, {
            id: interactionId,
            command: 'plan',
            agent,
            collaborativePlanning: true,
            input,
            inputRole: 'query',
          });
          metaSaved = true;
        },
      });
      if (id) {
        out.info(`To revise:  dr followup ${id} "<feedback>" --plan`);
        out.info(`To approve: dr followup ${id} "Looks good"`);
      }
      return;
    }

    const interaction = await createInteraction({
      input: input.text,
      agent,
      collaborativePlanning: true,
    });
    out.interactionId(interaction.id);
    await saveMeta(opts.saveMeta, {
      id: interaction.id,
      command: 'plan',
      agent,
      collaborativePlanning: true,
      input,
      inputRole: 'query',
    });

    if (opts.detach) {
      out.info('Detached. Use `dr get <id>` to check status.');
      return;
    }

    const result = await pollUntilDone(interaction.id);
    printOutputs(result.outputs);
    process.stdout.write('\n');
    out.info(`To revise:  dr followup ${interaction.id} "<feedback>" --plan`);
    out.info(`To approve: dr followup ${interaction.id} "Looks good"`);
  });

// ────────────────────────── dr followup ──────────────────────────

program
  .command('followup')
  .description('Continue a previous interaction (revise plan, approve, or ask questions)')
  .argument('<id>', 'interaction ID to continue from')
  .argument('[prompt]', 'follow-up message (reads stdin when omitted or "-")')
  .option('--message-file <path>', 'read the follow-up message from a file')
  .option('--save-meta <path>', 'append this follow-up interaction to a metadata file')
  .option('--plan', 'stay in planning mode (revise the plan)')
  .option('--stream', 'stream results in real-time')
  .option('--max', 'use the deep-research-max model')
  .addHelpText(
    'after',
    `
Without --plan the agent executes research (approve or post-report followup).
With --plan the agent returns a revised plan without executing.
Record the interaction ID you are continuing from and keep it with the original
query and report files.

Examples:
  $ dr followup <id> "Focus more on AMD and Groq" --plan
  $ dr followup <id> --message-file prompts/approval.txt --save-meta runs/topic.meta.json
  $ dr followup <id> "Elaborate on section 2" --stream
`,
  )
  .action(
    async (id: string, prompt: string | undefined, opts: FollowupOptions) => {
      const input = await resolvePromptInput({
        prompt,
        queryFile: opts.messageFile,
      });
      const agent = resolveAgent(opts.max);
      const collaborativePlanning = !!opts.plan;

      if (opts.stream) {
        let metaSaved = false;
        const newId = await streamInteraction({
          input: input.text,
          agent,
          collaborativePlanning,
          previousInteractionId: id,
          onInteractionStart: async (interactionId) => {
            if (!opts.saveMeta || metaSaved) return;
            await saveMeta(opts.saveMeta, {
              id: interactionId,
              command: 'followup',
              agent,
              collaborativePlanning,
              previousInteractionId: id,
              input,
              inputRole: 'followup_message',
            });
            metaSaved = true;
          },
        });
        if (newId && collaborativePlanning) {
          out.info(`To revise:  dr followup ${newId} "<feedback>" --plan`);
          out.info(`To approve: dr followup ${newId} "Looks good"`);
        }
        return;
      }

      const interaction = await createInteraction({
        input: input.text,
        agent,
        collaborativePlanning,
        previousInteractionId: id,
      });
      out.interactionId(interaction.id);
      await saveMeta(opts.saveMeta, {
        id: interaction.id,
        command: 'followup',
        agent,
        collaborativePlanning,
        previousInteractionId: id,
        input,
        inputRole: 'followup_message',
      });

      const result = await pollUntilDone(interaction.id);
      printOutputs(result.outputs);
      process.stdout.write('\n');

      if (collaborativePlanning) {
        out.info(`To revise:  dr followup ${interaction.id} "<feedback>" --plan`);
        out.info(`To approve: dr followup ${interaction.id} "Looks good"`);
      }
    },
  );

// ────────────────────────── dr get ──────────────────────────

program
  .command('get')
  .description('Retrieve the status or results of an interaction')
  .argument('[id]', 'interaction ID; optional when --meta-file has a latest interaction ID')
  .option('--wait', 'block until the interaction completes')
  .option('--json', 'output raw JSON (for scripting)')
  .option('--output <path>', 'write the retrieved result to a file instead of stdout')
  .option('--bundle <path>', 'write a report bundle with query + interaction log + final report')
  .option('--meta-file <path>', 'read metadata to resolve the latest interaction ID or build bundles')
  .option('--save-meta <path>', 'append this retrieval step to a metadata file')
  .addHelpText(
    'after',
    `
Best practice:
  \`dr get\` is the retrieval step in the async workflow.
  Use the recorded interaction ID to fetch the final report later, usually into a file.
  For a complete artifact, pair \`--meta-file\` with \`--bundle\`.

Examples:
  $ dr get <id>
  $ dr get <id> --wait --output reports/report.md
  $ dr get --meta-file runs/topic.meta.json --wait --bundle reports/topic.bundle.md
  $ dr get <id> --json | jq '.status'
`,
  )
  .action(async (id: string | undefined, opts: GetOptions) => {
    const interactionId = await resolveInteractionId(id, opts.metaFile);
    const result = opts.wait
      ? await pollUntilDone(interactionId)
      : await getInteraction(interactionId);

    await saveMeta(opts.saveMeta, {
      id: interactionId,
      command: 'get',
      status: result.status,
    });

    if (opts.json) {
      const payload = JSON.stringify(result, null, 2) + '\n';
      if (opts.output) {
        await writeTextFile(path.resolve(opts.output), payload);
        out.info(`Saved JSON result: ${path.resolve(opts.output)}`);
      } else {
        process.stdout.write(payload);
      }
      return;
    }

    out.info(`Status: ${result.status}`);

    if (result.status === 'completed') {
      const reportText = ensureTrailingNewline(renderOutputs(result.outputs));

      if (opts.output) {
        await writeTextFile(path.resolve(opts.output), reportText);
        out.info(`Saved report: ${path.resolve(opts.output)}`);
      } else {
        process.stdout.write(reportText);
      }

      if (opts.bundle) {
        const meta = opts.metaFile ? await readMetaFile(path.resolve(opts.metaFile)) : null;
        await writeBundleFile(path.resolve(opts.bundle), {
          interactionId,
          reportText,
          meta: meta ?? undefined,
        });
        out.info(`Saved report bundle: ${path.resolve(opts.bundle)}`);
      }
      return;
    }

    if (result.status === 'failed') {
      out.error('Interaction failed.');
      process.exit(1);
    }

    if (opts.bundle || opts.output) {
      throw new UsageError(
        'Result output files require a completed interaction. Use --wait or retry later.',
      );
    }

    out.info('Still in progress. Use --wait to block until done.');
  });

// ────────────────────────── Parse & run ──────────────────────────

program.parseAsync().catch((err: Error) => {
  out.error(err.message);
  process.exit(err instanceof UsageError ? err.exitCode : 1);
});

async function saveMeta(
  targetPath: string | undefined,
  update: {
    id: string;
    command: 'run' | 'plan' | 'followup' | 'get';
    previousInteractionId?: string;
    agent?: string;
    collaborativePlanning?: boolean;
    visualization?: boolean;
    input?: ResolvedPrompt;
    inputRole?: 'query' | 'followup_message';
    status?: string;
  },
): Promise<void> {
  if (!targetPath) return;

  const resolvedPath = path.resolve(targetPath);
  await upsertMetaFile(resolvedPath, update);
  out.info(`Saved metadata: ${resolvedPath}`);
}

async function resolveInteractionId(
  id: string | undefined,
  metaFile: string | undefined,
): Promise<string> {
  if (id) return id;
  if (!metaFile) {
    throw new UsageError(
      'Interaction ID is required unless --meta-file provides a latest interaction ID.',
    );
  }

  const resolvedPath = path.resolve(metaFile);
  const meta = await readMetaFile(resolvedPath);
  if (!meta?.latest_interaction_id) {
    throw new UsageError(
      `Could not resolve an interaction ID from metadata file: ${resolvedPath}`,
    );
  }
  return meta.latest_interaction_id;
}

async function assertDoesNotExist(targetPath: string): Promise<void> {
  try {
    await access(targetPath);
    throw new UsageError(
      `Refusing to overwrite existing file: ${targetPath}. Re-run with --force.`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}
