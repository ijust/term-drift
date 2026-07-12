# term-drift

English | [日本語](README.md)

term-drift detects terminology introduced or distorted during AI-assisted development and helps keep project documents aligned with the project's ubiquitous language.

It combines an agent skill with a deterministic CLI to find terminology introduced or semantically distorted during AI-assisted development and align project documentation with its ubiquitous language using only human-approved rewrites.

## Installation

The only requirements are Node.js 18.17 or later and git. term-drift has no external package dependencies.

```bash
npm install --global term-drift
```

To try it without installing:

```bash
npx term-drift --help
```

## Quick start (recommended: use the skill)

Install the bundled [`skills/term-drift`](skills/term-drift) skill in your AI coding agent, then ask it to inspect the target repository:

```text
Inspect the terminology in this repository with term-drift.
```

Humans are not expected to run `term-drift init /path/to/repository`. The skill starts the inspection through the CLI. Only when a persistent ledger or repository-specific rules become necessary does the agent ask for confirmation and run `init` itself. The first inspection can begin without `init`.

term-drift does not call an LLM API. The agent selected by the user interprets meaning, the human approves decisions, and the deterministic CLI handles scanning, application, and rechecking.

Candidates are not presented as a bare list of words. The skill presents one term at a time with a short quote from an actual use, its source, a proposed replacement, and the rewritten passage. The human can judge the surrounding meaning and the resulting wording before approving, rejecting, or deferring it.

The CLI is the skill's execution layer. See Commands below when using it directly for development, debugging, or another agent integration.

## What it does (one minimal cycle)

1. **Scan** — Collect repository documents read-only, prioritizing commit messages and planning documents while excluding secrets.
2. **Detect** — Find not only invented terms absent from the ledger, but also ordinary words repurposed as internal metaphors.
3. **Classify** — Sort terms into general vocabulary, approved team vocabulary, and suspected unauthorized terminology. Ask the user promptly when uncertain.
4. **Propose with quotes** — Quote actual usage and propose both replacement wording and the rewritten passage, using ledger examples when available.
5. **Human approval** — Approve terms individually; batch approval is not valid.
6. **Deterministic application** — Apply only approved replacements, only under git, and reversibly.
7. **Recheck** — Run detection again and converge on no findings, except explicitly justified exceptions.

## Safety guarantees

- Never write a single byte for an unapproved replacement.
- Never contact an external service at runtime.
- Never scan secret files such as `.env`, keys, or credentials.
- Never silently decide an uncertain term; ask the user promptly.

## Commands

```text
term-drift init [dir]
term-drift scan [dir]
term-drift ledger [dir]
term-drift apply <dictionary.json> [dir]
term-drift recheck <dictionary.json> [dir]
term-drift rules [dir]
```

`apply` changes only approved entries in tracked, clean, UTF-8 documents. It preserves Markdown code examples, inline code, link destinations, and exception comments. It exits with code 3 when any target cannot be applied or a recheck finds remaining occurrences.

Minimal dictionary format:

```json
{
  "replacements": [
    { "from": "wiring", "to": "integration", "approved": true }
  ]
}
```

## Documentation

- [Theory](docs/theory_en.md) ([日本語](docs/theory.md)) — Why a ledger, layered detection, per-term approval, and deterministic application are necessary
- [Detection rules](rules/detect.md) — Layered detection, three-way classification, and exclusions (Japanese)
- [Workflow](rules/workflow.md) — The cycle from scanning through rechecking (Japanese)

## Status

The walking skeleton is complete. Safety boundaries and detection accuracy remain under active improvement.

In a bounded evaluation against two real repositories, independent detection matched 17 of the 24 reachable findings, approximately 71%. term-drift is not a fully automatic classifier; it is an inspection procedure for producing candidates that humans review.

## License

MIT
