import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';
import * as out from './output.js';

// Suppress SDK "experimental" console.warn
const _warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (String(args[0]).includes('experimental')) return;
  _warn.apply(console, args);
};

const DEFAULT_AGENT = 'deep-research-preview-04-2026';
const MAX_AGENT = 'deep-research-max-preview-04-2026';
const POLL_INTERVAL_MS = 10_000;

type Interaction = Interactions.Interaction;
type InteractionSSEEvent = Interactions.InteractionSSEEvent;

// --------------- Client ---------------

let _client: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    out.error('Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.');
    process.exit(1);
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export function resolveAgent(max?: boolean): string {
  return max ? MAX_AGENT : DEFAULT_AGENT;
}

// --------------- Create (non-streaming) ---------------

export interface CreateOpts {
  input: string;
  agent: string;
  collaborativePlanning?: boolean;
  previousInteractionId?: string;
  visualization?: boolean;
}

export async function createInteraction(opts: CreateOpts): Promise<Interaction> {
  const client = getClient();
  const agent_config: Interactions.DeepResearchAgentConfig = {
    type: 'deep-research',
  };
  if (opts.collaborativePlanning !== undefined) {
    agent_config.collaborative_planning = opts.collaborativePlanning;
  }
  if (opts.visualization) {
    agent_config.visualization = 'auto';
  }

  return client.interactions.create({
    agent: opts.agent,
    input: opts.input,
    agent_config,
    background: true,
    previous_interaction_id: opts.previousInteractionId,
    stream: false as const,
  });
}

// --------------- Get / Poll ---------------

export async function getInteraction(id: string): Promise<Interaction> {
  return getClient().interactions.get(id);
}

export async function pollUntilDone(id: string): Promise<Interaction> {
  const spinner = out.createSpinner('Researching…');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await getClient().interactions.get(id);

    if (result.status === 'completed') {
      spinner.stop('Research completed.');
      return result;
    }
    if (result.status === 'failed') {
      spinner.fail('Research failed.');
      throw new Error('Interaction failed');
    }
    if (result.status === 'cancelled') {
      spinner.fail('Research cancelled.');
      throw new Error('Interaction cancelled');
    }

    spinner.update(`Researching… (status: ${result.status})`);
    await sleep(POLL_INTERVAL_MS);
  }
}

// --------------- Streaming ---------------

export interface StreamOpts extends CreateOpts {}

export async function streamInteraction(opts: StreamOpts): Promise<string | undefined> {
  const client = getClient();
  const agent_config: Interactions.DeepResearchAgentConfig = {
    type: 'deep-research',
    thinking_summaries: 'auto',
  };
  if (opts.collaborativePlanning !== undefined) {
    agent_config.collaborative_planning = opts.collaborativePlanning;
  }
  if (opts.visualization) {
    agent_config.visualization = 'auto';
  }

  let interactionId: string | undefined;
  let lastEventId: string | undefined;
  let isComplete = false;

  const processStream = async (stream: AsyncIterable<InteractionSSEEvent>) => {
    for await (const chunk of stream) {
      if (chunk.event_type === 'interaction.start') {
        interactionId = chunk.interaction?.id;
        if (interactionId) {
          out.interactionId(interactionId);
        }
      }
      if ('event_id' in chunk && chunk.event_id) {
        lastEventId = chunk.event_id;
      }
      if (chunk.event_type === 'content.delta') {
        const delta = chunk.delta;
        if (delta.type === 'text') {
          process.stdout.write(delta.text);
        } else if (delta.type === 'thought_summary') {
          const text =
            delta.content && 'text' in delta.content
              ? (delta.content as { text: string }).text
              : '';
          if (text) out.thought(text);
        } else if (delta.type === 'image') {
          out.info('[Image received]');
        }
      } else if (chunk.event_type === 'interaction.complete') {
        isComplete = true;
      } else if (chunk.event_type === 'interaction.status_update') {
        out.statusUpdate(`Status: ${chunk.status}`);
      } else if (chunk.event_type === 'error') {
        isComplete = true;
        const msg = chunk.error?.message;
        if (msg) out.error(msg);
      }
    }
  };

  // Initial stream
  const stream = await client.interactions.create({
    agent: opts.agent,
    input: opts.input,
    agent_config,
    background: true,
    stream: true as const,
    previous_interaction_id: opts.previousInteractionId,
  });
  await processStream(stream);

  // Reconnect loop if connection dropped before completion
  while (!isComplete && interactionId) {
    const status = await client.interactions.get(interactionId);
    if (status.status !== 'in_progress') {
      if (status.status === 'completed') {
        printOutputs(status.outputs);
      } else if (status.status === 'failed') {
        throw new Error('Research failed');
      }
      break;
    }

    out.info('Reconnecting stream…');
    const resumeStream = await client.interactions.get(interactionId, {
      stream: true as const,
      last_event_id: lastEventId,
    });
    await processStream(resumeStream);
  }

  process.stdout.write('\n');
  return interactionId;
}

// --------------- Output helpers ---------------

export function printOutputs(outputs: Interaction['outputs']) {
  if (!outputs?.length) return;
  for (const output of outputs) {
    if ('text' in output && output.type === 'text') {
      process.stdout.write(output.text);
    } else if (output.type === 'image' && 'data' in output) {
      out.info(`[Image: base64, ${String((output as any).data).length} chars]`);
    }
  }
}

// --------------- Utilities ---------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------- Stdin helper ---------------

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

export async function resolvePrompt(prompt?: string): Promise<string> {
  if (prompt === '-' || (!prompt && !process.stdin.isTTY)) {
    return readStdin();
  }
  if (!prompt) {
    out.error('Prompt is required. Provide as argument or pipe via stdin.');
    process.exit(2);
  }
  return prompt;
}
