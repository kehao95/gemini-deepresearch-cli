import { readFile } from 'node:fs/promises';
import path from 'node:path';

export class UsageError extends Error {
  readonly exitCode = 2;
}

export type PromptSource = 'argument' | 'stdin' | 'file';

export interface ResolvedPrompt {
  text: string;
  source: PromptSource;
  path?: string;
}

export interface ResolvePromptInputOpts {
  prompt?: string;
  queryFile?: string;
  cwd?: string;
  stdin?: AsyncIterable<Buffer | string>;
  stdinIsTTY?: boolean;
}

export async function readStdin(
  stdin: AsyncIterable<Buffer | string> = process.stdin,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

export async function resolvePromptInput(
  opts: ResolvePromptInputOpts,
): Promise<ResolvedPrompt> {
  const cwd = opts.cwd ?? process.cwd();
  const stdinIsTTY = opts.stdinIsTTY ?? !!process.stdin.isTTY;

  if (opts.queryFile) {
    if (opts.prompt && opts.prompt !== '-') {
      throw new UsageError(
        'Provide either a prompt argument or --query-file, not both.',
      );
    }

    const resolvedPath = path.resolve(cwd, opts.queryFile);
    const text = (await readFile(resolvedPath, 'utf-8')).trim();
    if (!text) {
      throw new UsageError(`Query file is empty: ${opts.queryFile}`);
    }
    return { text, source: 'file', path: resolvedPath };
  }

  if (opts.prompt === '-' || (!opts.prompt && !stdinIsTTY)) {
    const text = await readStdin(opts.stdin ?? process.stdin);
    if (!text) {
      throw new UsageError('Prompt is empty. Provide text via stdin or a file.');
    }
    return { text, source: 'stdin' };
  }

  if (!opts.prompt) {
    throw new UsageError(
      'Prompt is required. Provide as argument, --query-file, or pipe via stdin.',
    );
  }

  return { text: opts.prompt, source: 'argument' };
}
