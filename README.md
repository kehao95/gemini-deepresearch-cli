# dr — Gemini Deep Research CLI

[![npm version](https://img.shields.io/npm/v/gemini-deepresearch-cli)](https://www.npmjs.com/package/gemini-deepresearch-cli)
[![license](https://img.shields.io/npm/l/gemini-deepresearch-cli)](./LICENSE)

A POSIX-friendly CLI for the [Google Gemini Deep Research Agent](https://ai.google.dev/gemini-api/docs/deep-research). Plan, run, stream, and follow up on multi-step research tasks from your terminal.

```
dr run "Analyze the 2026 AI chip market" --stream
```

## Install

```bash
npm install -g gemini-deepresearch-cli
```

Requires Node.js ≥ 18 and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
export GEMINI_API_KEY="your-key-here"
```

## Commands

### `dr run` — Start research immediately

```bash
dr run "Compare React, Vue, and Svelte"           # poll, print report
dr run "Compare React, Vue, and Svelte" --stream   # stream with thinking
dr run "Long research topic" --detach              # fire & forget
dr run "Market analysis" --max                     # use deep-research-max
dr run "Trends with charts" --visualize            # include graphs
echo "Research prompt" | dr run                    # read from stdin
```

### `dr plan` — Get a research plan first

```bash
dr plan "Research quantum computing hardware"
# → prints plan + interaction ID
# → suggests next steps:
#   dr followup <id> "<feedback>" --plan   (revise)
#   dr followup <id> "Looks good"          (approve & execute)
```

### `dr followup` — Continue the conversation

```bash
# Revise a plan (stays in planning mode)
dr followup <id> "Focus more on superconducting qubits" --plan

# Approve and execute the plan
dr followup <id> "Looks good, run it"

# Ask questions about a completed report
dr followup <id> "Elaborate on section 2" --stream
```

### `dr get` — Check status or retrieve results

```bash
dr get <id>                    # check status
dr get <id> --wait             # block until done, then print
dr get <id> --wait > report.md # save to file
dr get <id> --json             # raw JSON for scripting
dr get <id> --json | jq '.status'
```

## Workflow

```
┌─────────────────────────────────────────────────┐
│  dr plan "topic"                                │
│    ↓                                            │
│  review plan                                    │
│    ↓                                            │
│  dr followup <id> "feedback" --plan  (revise)   │
│    ↓                                            │
│  dr followup <id> "looks good"       (approve)  │
│    ↓                                            │
│  report generated                               │
│    ↓                                            │
│  dr followup <id> "question"         (Q&A)      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  dr run "topic"                                 │
│    ↓                                            │
│  report generated                               │
│    ↓                                            │
│  dr followup <id> "question"         (Q&A)      │
└─────────────────────────────────────────────────┘
```

## POSIX Conventions

| Convention | Behavior |
|---|---|
| **stdout** | Report text only — pipe-safe |
| **stderr** | UI chrome (spinner, status, IDs, hints) |
| **stdin** | Reads prompt when arg is `-` or omitted with piped input |
| **NO_COLOR** | Respected — disables all ANSI escapes |
| **Exit 0** | Success |
| **Exit 1** | Runtime / API error |
| **Exit 2** | Usage error (missing args) |
| **--json** | Machine-readable output on `dr get` |

```bash
# Pipe-friendly: report to stdout, UI to stderr
dr run "topic" --stream > report.md
dr get <id> --wait | wc -w
dr get <id> --json | jq '.outputs[-1].text' > report.txt
```

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Gemini API key (required) |
| `GOOGLE_API_KEY` | Alternative API key variable |
| `NO_COLOR` | Disable colored output when set |

## Models

| Flag | Model | Use case |
|---|---|---|
| _(default)_ | `deep-research-preview-04-2026` | Fast, efficient |
| `--max` | `deep-research-max-preview-04-2026` | Maximum depth |

## API Reference

This CLI wraps the [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions) and the [Deep Research Agent](https://ai.google.dev/gemini-api/docs/deep-research).

## License

MIT
