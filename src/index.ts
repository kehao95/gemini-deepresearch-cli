#!/usr/bin/env node

import { Command } from 'commander';
import {
  resolveAgent,
  resolvePrompt,
  createInteraction,
  getInteraction,
  pollUntilDone,
  streamInteraction,
  printOutputs,
} from './api.js';
import * as out from './output.js';

const program = new Command();

program
  .name('dr')
  .description('CLI for Google Gemini Deep Research Agent')
  .version('0.1.0')
  .addHelpText(
    'after',
    `
Environment:
  GEMINI_API_KEY    Gemini API key (required)
  GOOGLE_API_KEY    Alternative API key variable
  NO_COLOR          Disable colored output when set

Workflow:
  dr plan  → review → dr followup --plan → dr followup (approve)
  dr run   → done   → dr followup (ask questions about report)

Examples:
  $ dr run "Analyze the 2026 AI chip market"
  $ dr run "Compare React vs Vue" --stream
  $ dr plan "Research quantum computing" --detach
  $ dr followup <id> "Focus more on hardware" --plan
  $ dr followup <id> "Looks good, run it"
  $ dr get <id> --wait | head -50
  $ echo "Research topic" | dr run -
`,
  );

// ────────────────────────── dr run ──────────────────────────

program
  .command('run')
  .description('Start research and wait for the report')
  .argument('[prompt]', 'research prompt (reads stdin when omitted or "-")')
  .option('--stream', 'stream results in real-time')
  .option('--detach', 'print interaction ID and exit immediately')
  .option('--max', 'use the deep-research-max model for maximum depth')
  .option('--visualize', 'enable charts and graphs in the report')
  .addHelpText(
    'after',
    `
Examples:
  $ dr run "Analyze the 2026 AI chip market"
  $ dr run "Compare React vs Vue" --stream --max
  $ dr run "Market analysis with graphs" --visualize
  $ dr run --detach "Long research topic"
  $ echo "Research topic" | dr run
`,
  )
  .action(async (prompt: string | undefined, opts: Record<string, boolean>) => {
    const input = await resolvePrompt(prompt);
    const agent = resolveAgent(opts.max);

    if (opts.stream) {
      await streamInteraction({ input, agent, visualization: opts.visualize });
      return;
    }

    const interaction = await createInteraction({
      input,
      agent,
      visualization: opts.visualize,
    });
    out.interactionId(interaction.id);

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
  .argument('[prompt]', 'research prompt (reads stdin when omitted or "-")')
  .option('--stream', 'stream the plan in real-time')
  .option('--detach', 'print interaction ID and exit immediately')
  .option('--max', 'use the deep-research-max model')
  .addHelpText(
    'after',
    `
After receiving a plan you can:
  $ dr followup <id> "Add a section on costs" --plan   # revise
  $ dr followup <id> "Looks good"                      # approve & execute

Examples:
  $ dr plan "Research quantum computing hardware"
  $ dr plan "EV battery landscape" --stream
`,
  )
  .action(async (prompt: string | undefined, opts: Record<string, boolean>) => {
    const input = await resolvePrompt(prompt);
    const agent = resolveAgent(opts.max);

    if (opts.stream) {
      const id = await streamInteraction({
        input,
        agent,
        collaborativePlanning: true,
      });
      if (id) {
        out.info(`To revise:  dr followup ${id} "<feedback>" --plan`);
        out.info(`To approve: dr followup ${id} "Looks good"`);
      }
      return;
    }

    const interaction = await createInteraction({
      input,
      agent,
      collaborativePlanning: true,
    });
    out.interactionId(interaction.id);

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
  .option('--plan', 'stay in planning mode (revise the plan)')
  .option('--stream', 'stream results in real-time')
  .option('--max', 'use the deep-research-max model')
  .addHelpText(
    'after',
    `
Without --plan the agent executes research (approve or post-report followup).
With --plan the agent returns a revised plan without executing.

Examples:
  $ dr followup <id> "Focus more on AMD and Groq" --plan
  $ dr followup <id> "Looks good, execute the plan"
  $ dr followup <id> "Elaborate on section 2" --stream
`,
  )
  .action(async (id: string, prompt: string | undefined, opts: Record<string, boolean>) => {
    const input = await resolvePrompt(prompt);
    const agent = resolveAgent(opts.max);
    const collaborativePlanning = !!opts.plan;

    if (opts.stream) {
      const newId = await streamInteraction({
        input,
        agent,
        collaborativePlanning,
        previousInteractionId: id,
      });
      if (newId && collaborativePlanning) {
        out.info(`To revise:  dr followup ${newId} "<feedback>" --plan`);
        out.info(`To approve: dr followup ${newId} "Looks good"`);
      }
      return;
    }

    const interaction = await createInteraction({
      input,
      agent,
      collaborativePlanning,
      previousInteractionId: id,
    });
    out.interactionId(interaction.id);
    const result = await pollUntilDone(interaction.id);
    printOutputs(result.outputs);
    process.stdout.write('\n');

    if (collaborativePlanning) {
      out.info(`To revise:  dr followup ${interaction.id} "<feedback>" --plan`);
      out.info(`To approve: dr followup ${interaction.id} "Looks good"`);
    }
  });

// ────────────────────────── dr get ──────────────────────────

program
  .command('get')
  .description('Retrieve the status or results of an interaction')
  .argument('<id>', 'interaction ID')
  .option('--wait', 'block until the interaction completes')
  .option('--json', 'output raw JSON (for scripting)')
  .addHelpText(
    'after',
    `
Examples:
  $ dr get <id>
  $ dr get <id> --wait
  $ dr get <id> --wait > report.md
  $ dr get <id> --json | jq '.status'
`,
  )
  .action(async (id: string, opts: Record<string, boolean>) => {
    if (opts.wait) {
      const result = await pollUntilDone(id);
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        printOutputs(result.outputs);
        process.stdout.write('\n');
      }
      return;
    }

    const result = await getInteraction(id);

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }

    out.info(`Status: ${result.status}`);

    if (result.status === 'completed') {
      printOutputs(result.outputs);
      process.stdout.write('\n');
    } else if (result.status === 'failed') {
      out.error('Interaction failed.');
      process.exit(1);
    } else {
      out.info('Still in progress. Use --wait to block until done.');
    }
  });

// ────────────────────────── Parse & run ──────────────────────────

program.parseAsync().catch((err: Error) => {
  out.error(err.message);
  process.exit(1);
});
