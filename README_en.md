# term-drift

English | [日本語](README.md)

term-drift detects terminology introduced or distorted during AI-assisted development and helps keep project documents aligned with the project's ubiquitous language.

It combines an agent skill with a deterministic CLI to find terminology introduced or semantically distorted during AI-assisted development and align project documentation through guided review or explicitly delegated low-risk rewrites.

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

It never overwrites an existing ledger, rules, or an identical skill. If a skill with the same name has different contents, installation stops as incomplete instead of replacing it.

To update an existing installation, select its agent explicitly:

```bash
npx term-drift@latest update --claude
npx term-drift@latest update --codex
npx term-drift@latest update --gemini
```

`update` replaces rules and skill files only when they match a known official release. It refuses to overwrite assets that may have been customized and restores all changed assets if an update fails. It writes `.term-drift/version.json` only after verifying every asset, so a new version cannot be reported as complete while old rules remain.

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

term-drift does not call an LLM API. The selected agent interprets meaning and may decide explicitly delegated low-risk rewrites, humans retain high-impact and ledger decisions, and the deterministic CLI handles scanning, application, and rechecking.

Candidates are not treated as a bare list of words. The skill reads every occurrence individually, then groups only occurrences with equivalent meaning and the same proposed decision. Guided review lets the human approve, reject, defer, or split each group. If the user explicitly delegates a repository, current review, term, or other clear scope, the agent may decide low-risk groups and asks only about unresolved meaning, material alternatives, or wording that may affect obligations, legal or security meaning, public APIs, or runtime behavior. Broad delegation is discouraged; occurrence inspection and an auditable rewrite list remain required.

When the user asks to continue a terminology review, the skill restores prior decisions from the conversation and approved records, completes the occurrence inventory internally, and resumes with the next unresolved semantic group instead of asking the user to choose operational steps again. A term approved as general can be stored in the ledger's optional classification column with status `approved` and classification `general`, so another session does not ask for the same classification again. This persists only the term classification; specialized local uses and unclear sentences are still reviewed. The skill asks for a safe resume point only when the available evidence cannot establish one.

The CLI is the skill's execution layer. See Commands below when using it directly for development, debugging, or another agent integration.

## What it does (one minimal cycle)

1. **Scan** — Collect repository documents read-only, prioritizing commit messages and planning documents while excluding secrets.
2. **Detect** — Find not only invented terms absent from the ledger, but also ordinary words repurposed as internal metaphors.
3. **Classify** — Sort terms into general vocabulary, approved team vocabulary, and suspected unapproved project terminology. Ask the user promptly when uncertain.
4. **Propose with quotes** — Quote actual usage and propose both replacement wording and the rewritten passage, using ledger examples when available.
5. **Decision authority** — Use guided human review by default; under an explicit bounded delegation, let the agent decide low-risk groups and escalate high-impact or unresolved cases.
6. **Deterministic application** — Apply only approved replacements, only under git, and reversibly.
7. **Recheck** — Run detection again and converge on no findings, except explicitly justified exceptions.

## Safety guarantees

- Write only replacements authorized by guided approval or an explicit bounded delegation.
- Never contact an external service at runtime.
- Never scan secret files such as `.env`, keys, or credentials.
- Never silently decide an uncertain term; ask the user promptly.

## Commands

```text
term-drift
term-drift --claude | --codex | --gemini
term-drift update --claude|--codex|--gemini [dir]
term-drift init [dir]
term-drift scan [dir]
term-drift ledger [dir]
term-drift apply <dictionary.json> [dir]
term-drift recheck <dictionary.json> [dir]
term-drift rules [dir]
```

No arguments and the three agent options perform a project-local installation in the current directory. The remaining subcommands form the deterministic execution layer used by the skill and are also available for development, debugging, and other integrations.

`apply` changes each decided entry only at one unique occurrence in its repository-relative `path`. The new format also validates decision provenance and returns the rewrite unit's `from` and `to` together with `decisionSource`, `decidedAt`, and `delegationScope` for every applied change. It rejects dictionaries without a path and entries matching multiple locations before writing. Targets must be tracked UTF-8 documents. If a target has unstaged changes and `from` still matches uniquely in the current content, `apply` preserves unrelated changes, performs the rewrite, and reports the file in `warningsDirty` and stderr. Untracked files, invalid UTF-8, ambiguous or overlapping rewrites, and protected Markdown fragments remain blocked.

Minimal new dictionary format with durable decision provenance:

```json
{
  "decision_metadata_version": 1,
  "replacements": [
    { "term": "wiring", "term_occurrences": 1, "path": "docs/setup.md", "from": "Finish the wiring between the form and layout.", "to": "Connect the form and layout.", "approved": true, "decision_source": "human-approved", "decided_at": "2026-07-16", "delegation_scope": null }
  ]
}
```

Use `decision_source: human-approved` for an individually approved rewrite and `decision_source: delegated-agent` for a low-risk decision made inside explicit delegation; the latter records that boundary in `delegation_scope`. Legacy dictionaries remain applicable, but their changes report `decisionSource: legacy-unknown`. Retain applied dictionaries under `.term-drift/` to preserve provenance without embedding markers in prose.

## Documentation

- [Theory](docs/theory_en.md) ([日本語](docs/theory.md)) — Why a ledger, layered detection, explicit decision authority, and deterministic application are necessary
- [Detection rules](rules/detect.md) — Layered detection, three-way classification, and exclusions (Japanese)
- [Workflow](rules/workflow.md) — The cycle from scanning through rechecking (Japanese)

## Status

The walking skeleton is complete. Safety boundaries and detection accuracy remain under active improvement.

In a bounded evaluation against two real repositories, independent detection matched 17 of the 24 reachable findings, approximately 71%. term-drift is not a fully automatic classifier; it is an inspection procedure for producing candidates that humans review.

## License

MIT
