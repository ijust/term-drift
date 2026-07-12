# term-drift

English | [日本語](README.md)

term-drift detects terminology introduced or distorted during AI-assisted development and helps keep project documents aligned with the project's ubiquitous language.

It combines an agent skill with a deterministic CLI to find terminology introduced or semantically distorted during AI-assisted development and align project documentation with its ubiquitous language using only human-approved rewrites.

## Installation

The only requirements are Node.js 18.17 or later and git. Run the installer from the target project's root for the agent you use.

```bash
# Claude Code (default)
npx term-drift@latest

# Explicit agent selection
npx term-drift@latest --claude
npx term-drift@latest --codex
npx term-drift@latest --gemini
```

The installer places `.term-drift/` and one project-local skill. It records the installed term-drift version in `.term-drift/version.json`; the skill invokes that pinned CLI version through `npx` rather than using `@latest`. It does not modify the target project's `package.json`, lockfile, or `node_modules`.

- Claude Code: `.claude/skills/term-drift/`
- Codex: `.agents/skills/term-drift/`
- Gemini CLI: `.gemini/skills/term-drift/`

It never overwrites an existing ledger, rules, or an identical skill. If a same-name skill has different contents, installation stops as incomplete instead of replacing it.

## Quick start (recommended: use the skill)

After installation, start term-drift in the target repository. Claude Code supports explicit invocation:

```text
/term-drift
```

With Codex or Gemini CLI, ask naturally:

```text
Inspect the terminology in this repository with term-drift.
```

Humans are not expected to assemble `term-drift init /path/to/repository`. The installer determines the locations of the ledger, rules, and skill, and reports completion only after verifying every required asset.

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
term-drift
term-drift --claude | --codex | --gemini
term-drift init [dir]
term-drift scan [dir]
term-drift ledger [dir]
term-drift apply <dictionary.json> [dir]
term-drift recheck <dictionary.json> [dir]
term-drift rules [dir]
```

No arguments and the three agent options perform a project-local installation in the current directory. The remaining subcommands form the deterministic execution layer used by the skill and are also available for development, debugging, and other integrations.

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
