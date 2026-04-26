# dr — Gemini Deep Research CLI

[![npm version](https://img.shields.io/npm/v/gemini-deepresearch-cli)](https://www.npmjs.com/package/gemini-deepresearch-cli)
[![license](https://img.shields.io/npm/l/gemini-deepresearch-cli)](./LICENSE)

A POSIX-friendly CLI for the [Google Gemini Deep Research Agent](https://ai.google.dev/gemini-api/docs/deep-research). Plan, run, stream, and follow up on multi-step research tasks from your terminal.

```
dr run --query-file queries/ai-chip-market-2026.md --stream
```

## What counts as a good research query

Deep Research should be given a **full agent-facing research brief**, not a keyword list and not a casual one-line chat question.

A qualified query should usually include:

- **Context**: why this research is being done and what decision, memo, or report it supports
- **Research question**: the exact question or set of questions the agent must answer
- **Scope**: time range, geography, entities to include, entities to exclude
- **Deliverables**: what the final report must contain such as comparisons, risks, tables, citations, and open questions
- **Constraints**: source preferences, evidence standards, exclusions, and how uncertainty should be handled
- **Output requirements**: expected structure, formatting, and decision criteria

Bad inputs:

```text
AI chips 2026
Compare React Vue Svelte
What is the best coding agent?
```

Better input shape:

```markdown
# Context
I am preparing an internal memo for a technical leadership review on AI accelerator
vendors for 2026 infrastructure planning.

# Research questions
1. Compare NVIDIA, AMD, Google TPU, AWS Trainium, and Groq on performance, software
   ecosystem, availability, pricing signals, and likely deployment fit.
2. Identify what changed between 2025 and 2026.
3. Flag where evidence is weak or contradictory.

# Scope
- Focus on public information available as of the research date.
- Prioritize primary sources: vendor docs, earnings materials, benchmark methodology,
  cloud product pages, and major analyst reports.
- Exclude consumer GPUs and purely speculative rumors unless clearly labeled.

# Deliverables
- Executive summary
- Vendor-by-vendor comparison table
- Key uncertainties and missing data
- Recommendation frame for a buyer choosing between training and inference stacks

# Output requirements
- Cite sources inline.
- Distinguish confirmed facts from inference.
- Call out likely marketing claims or incomparable benchmarks.
```

Recommended habit: save serious queries in versioned files such as `queries/ai-chip-market-2026.md` so the exact brief can be reused, reviewed, and archived with the resulting report.

## Install

```bash
npm install -g gemini-deepresearch-cli
```

Requires Node.js ≥ 18 and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
export GEMINI_API_KEY="your-key-here"
```

## Commands

### `dr init-query` — Create a reusable query template

```bash
dr init-query queries/ai-chip-market-2026.md --title "AI Chip Market 2026"
dr init-query - --title "Benchmark Audit"     # print template to stdout
```

Use this first for any serious task. It gives you a file-shaped research brief with the expected sections already laid out.

### `dr run` — Start research immediately from a complete query brief

```bash
dr run --query-file queries/react-frameworks.md
dr run --query-file queries/react-frameworks.md --stream
dr run --query-file queries/long-research.md --detach --save-meta runs/long.meta.json
dr run --query-file queries/market-analysis.md --max --visualize
cat queries/topic.md | dr run --save-meta runs/topic.meta.json -
```

Use `dr run` when the query is already well-formed and you are ready to execute immediately. `--query-file` is the preferred input path for non-trivial work. `--save-meta` records the originating query and interaction IDs for later retrieval.

### `dr plan` — Get a research plan first

```bash
dr plan --query-file queries/quantum-hardware.md --save-meta runs/quantum.meta.json
# → prints plan + interaction ID
# → suggests next steps:
#   dr followup <id> "<feedback>" --plan   (revise)
#   dr followup <id> "Looks good"          (approve & execute)
```

This is the recommended entry point for async research. Save the metadata file so the interaction lineage and original query stay attached to the work.

### `dr followup` — Continue the conversation

```bash
# Revise a plan (stays in planning mode)
dr followup <id> "Focus more on superconducting qubits" --plan

# Approve and execute the plan
dr followup <id> "Looks good, run it"

# Use a file for longer approval or revision notes
dr followup <id> --message-file prompts/approval.txt --save-meta runs/quantum.meta.json

# Ask questions about a completed report
dr followup <id> "Elaborate on section 2" --stream
```

### `dr get` — Check status or retrieve results

```bash
dr get <id>                    # check status
dr get <id> --wait             # block until done, then print
dr get <id> --wait --output report.md
dr get --meta-file runs/quantum.meta.json --wait --bundle reports/quantum.bundle.md
dr get <id> --json             # raw JSON for scripting
dr get <id> --json | jq '.status'
```

`--meta-file` can resolve the latest saved interaction ID automatically. `--bundle` writes a complete artifact containing the original query, interaction log, and final report.

## Recommended async workflow

For important work, prefer a file-based, ID-based workflow instead of an ad hoc one-liner in a single shell session.

1. Generate and fill in the full research query file.

```bash
dr init-query queries/ai-chip-market-2026.md --title "AI Chip Market 2026"
$EDITOR queries/ai-chip-market-2026.md
```

2. Start with planning mode and save metadata immediately.

```bash
dr plan --query-file queries/ai-chip-market-2026.md \
  --save-meta runs/ai-chip-market-2026.meta.json \
  > plans/ai-chip-market-2026.plan.md
```

3. The metadata file records the query and interaction ID for you.

Example metadata file contains:

```text
query_file=queries/ai-chip-market-2026.md
interaction_id=abc123...
created_at=2026-04-26
```

4. Revise the plan as needed while staying in planning mode.

```bash
dr followup <id> "Narrow the vendor set to hyperscaler and merchant options only." --plan
```

5. Approve and execute once the plan is acceptable.

```bash
dr followup <id> \
  "Looks good. Execute the plan and keep explicit source-backed comparisons." \
  --save-meta runs/ai-chip-market-2026.meta.json
```

6. Retrieve the final report later using the saved metadata file.

```bash
dr get \
  --meta-file runs/ai-chip-market-2026.meta.json \
  --wait \
  --output reports/ai-chip-market-2026.md \
  --bundle reports/ai-chip-market-2026.bundle.md
```

7. Continue from the same interaction when you need clarifications or extensions.

```bash
dr followup <id> \
  "Add a short section comparing training vs inference procurement risk." \
  --stream \
  --save-meta runs/ai-chip-market-2026.meta.json
```

Recommended durable research bundle:

- the original query file
- the metadata file created by `--save-meta`
- the plan output
- the final report from `dr get --output`
- the final bundle from `dr get --bundle`
- any meaningful follow-up outputs

This makes the research auditable and reproducible: you can inspect the exact brief, the exact interaction lineage, and the exact resulting report.

## Workflow

```
┌─────────────────────────────────────────────────┐
│  dr init-query queries/topic.md                 │
│    ↓                                            │
│  fill in query file                             │
│    ↓                                            │
│  dr plan --query-file queries/topic.md          │
│    ↓                                            │
│  review plan                                    │
│    ↓                                            │
│  dr followup <id> "feedback" --plan  (revise)   │
│    ↓                                            │
│  dr followup <id> "looks good"       (approve)  │
│    ↓                                            │
│  dr get --meta-file runs/topic.meta.json        │
│    ↓                                            │
│  dr followup <id> "question"         (Q&A)      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  dr run --query-file queries/topic.md           │
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

For serious research, replace `"topic"` with `--query-file`, use `--save-meta`, and let `--bundle` produce the final merged artifact.

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
