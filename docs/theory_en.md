# The theory behind term-drift

English | [日本語](theory.md)

term-drift is a lightweight mechanism for finding terminology drift introduced into projects during AI-assisted development and safely applying **only human-approved rewrites**.

The problem is broader than inconsistent spelling. It includes multiple names accumulating for the same concept, ordinary words being repurposed with special internal meanings, and definitions that exist but cannot be reached from where a term is used. As these problems accumulate, documents may remain grammatically readable while becoming impossible for a newcomer to reconstruct semantically.

term-drift approaches this problem by combining Domain-Driven Design's **Ubiquitous Language**, terminology management, cognitive load, common ground, information foraging, and Human-in-the-Loop principles. Its central design choice is not to automate semantic judgment completely, but to divide responsibility among an LLM, a human, and deterministic software.

**You do not need this document to use term-drift.** The operational procedure is in [`rules/workflow.md`](../rules/workflow.md). This document is a reference for understanding why term-drift needs a ledger, why dictionary comparison is insufficient, and why approval happens one term at a time.

## Concept map

| term-drift concept | Underlying idea | Primary sources |
|---|---|---|
| Canonical vocabulary and ledger | Ubiquitous Language, glossaries, controlled vocabulary | Evans / ISO 704 and 1087 |
| Reader-relative three-way classification | Common ground and audience design | Clark & Brennan / Clark |
| Difference from the ledger | Comparison with a controlled vocabulary | ISO 704 / terminology management |
| Internal repurposing of ordinary words | Metaphor, polysemy, semantic shift | Lakoff & Johnson |
| Reachability of definitions | Information scent and information foraging | Pirolli & Card |
| Fragmented names for the same concept | The vocabulary problem | Furnas et al. |
| LLM detection, human approval, deterministic application | Human-in-the-Loop and separation of mechanism from judgment | Amershi et al. / Bainbridge |
| Per-term approval | Reducing automation bias and preserving selective attention | Parasuraman & Riley / Bainbridge |
| Zero writes without approval | Authorization and Design by Contract | Meyer |
| Reasons recorded for retained exceptions | Lint suppression with rationale and design rationale | Nygard / design rationale |
| Application only to clean, git-managed documents | Reversible change and safe migration | Feathers / Fowler |
| Rechecking and idempotence after application | Feedback loops and contract checking | Deming / Meyer |
| Secret exclusion and no external communication | Data minimization and least privilege | Saltzer & Schroeder |
| Shared ledger with intent-planner | Single source of truth and loose coupling | Evans / docs-as-code |

## The problem: AI is a participant that introduces language at scale

Terminology shifts naturally among human developers. AI coding agents, however, can generate large volumes of design documents, commit messages, and explanations in a short time, greatly increasing both the **rate and replication range** of that drift.

A model chooses plausible words from general corpora, conventions in other projects, and the recent conversation. Whether a word has been agreed upon in the target project cannot be determined from the model's general vocabulary alone. Wording may sound natural locally while creating project-wide divergence:

- It assigns a new name to an existing concept, splitting the entry points for search and conversation.
- It repurposes an ordinary word, imposing two competing interpretations on a new reader.
- It spreads a term that was explained only once without leaving a route back to its definition.
- Later generated text repeats earlier generated terminology, creating the appearance that frequent use implies correctness.

As Furnas et al. showed in “The Vocabulary Problem,” people do not reliably choose the same words for the same things. AI does not eliminate this classical mismatch; its generation speed can amplify it.

In term-drift, **term drift** means that the form of a term, its meaning, or the path to its definition has moved away from team agreement. General identifier renaming and translation choices are outside its scope. Command names, function names, and configuration keys referenced by grep or operational procedures are also machine-facing contracts, so term-drift does not mix them with prose rewriting.

## Canonical vocabulary is a social contract, not a dictionary

Eric Evans's Ubiquitous Language is the language shared by domain experts and developers to discuss a model and used continuously in conversation, documentation, and code. What matters is not whether a general dictionary contains a word, but **whether this team has agreed on the same meaning**.

term-drift therefore does not infer a term's status from the string alone. It classifies terms relative to both the ledger state and the intended reader:

1. **General vocabulary** — A term in the assumed reader's basic vocabulary.
2. **Team vocabulary** — A term recorded as approved in the ledger.
3. **Suspected unauthorized terminology** — A term absent from the ledger, still provisional, or used again after being rejected.

This classification is consistent with Clark and Brennan's account of grounding. Communication requires more than the sender knowing a term; it requires common ground from which the recipient can reach its meaning. Judgments such as “an expert will understand this” or “this is common in English” change when the reader changes.

The ledger records agreement rather than truth, so entries have states:

- **Approved** — Treat as shared team vocabulary.
- **Provisional** — Someone has begun using it, but the team has not agreed yet.
- **Rejected** — Do not adopt it. Keep the row so a later reinvention can be detected.

An entry with no state defaults to provisional rather than approved. Mere presence in an existing document must not be laundered into team approval.

## Why detection has three layers

### Layer 1: difference from the ledger

The first layer compares project-specific-looking terms in scanned material with canonical terms and variants in the ledger. This is the straightforward application of controlled-vocabulary terminology management.

It is not sufficient by itself. It can find unregistered proper-looking noun phrases, but it misses specialized uses of otherwise ordinary words such as `drain`, `settle`, `lobby`, or the Japanese verb meaning “to wire.”

### Layer 2: metaphorical reuse and semantic shift

As Lakoff and Johnson argued, metaphor is not merely decoration; it is a basic mechanism for understanding and structuring concepts. Metaphors such as `pipeline`, `drain`, and `bridge` are useful in software development. But when a metaphor acquires a local meaning and spreads without explanation, readers must hold both its familiar meaning and its project-specific meaning at once.

The second layer therefore asks not whether a word is unusual, but **whether an ordinary meaning has been repurposed into a project-specific one**. A fixed word list or regular expression cannot decide this reliably; the surrounding context must be read.

### Layer 3: reachability of definitions

Even when a definition exists somewhere, a term is effectively undefined to a new reader if the definition cannot be reached from the place of use. In Pirolli and Card's information-foraging account, people follow information scent to seek sources whose expected value justifies the reading cost. Without links, first-use explanations, or references to a glossary, that scent is weak.

The third layer therefore checks not only whether a definition **exists**, but whether it is **reachable** from usage.

| Situation | Ledger difference | Metaphorical reuse | Reachability |
|---|---:|---:|---:|
| Unregistered project-specific concept | Easy to detect | Sometimes relevant | Check when a definition exists |
| Internal reuse of an ordinary word | Easy to miss | Primary detector | Also check the route to its definition |
| Definition exists only in another document | May be silent if registered | Sometimes relevant | Primary detector |

These layers are complementary, covering different failure modes rather than competing as alternative methods.

## Why detection is not a fully mechanical decision

Whether a term is general vocabulary, an actual external proper name, or something a new reader needs explained cannot be determined from its characters alone. A fixed basic-vocabulary list creates a new maintenance problem across languages, professions, and projects. Treating web frequency as truth conflates external popularity with team agreement.

term-drift delegates this reading to an LLM, but does not convert the LLM's judgment into authority.

```text
Collect scan targets --> Contextual detection, classification, proposal --> Human judgment per term
 deterministic CLI                    host LLM                              human
       |                                                                         |
       +------------ approved dictionary --> apply --> recheck <----------------+
                                                deterministic CLI
```

- The **LLM** produces candidates and reasons. It asks the human rather than guessing when uncertain.
- The **human** approves, rejects, or defers based on meaning, audience, and team agreement.
- The **CLI** applies only explicit approved data, deterministically.

This division is more than decorative Human-in-the-Loop design. As Bainbridge observed in “Ironies of Automation,” when automation absorbs judgment, humans tend to lose the attention and context needed to supervise it. term-drift leaves semantic authority with the human while assigning repetitive, error-prone replacement to software.

## Approve one term at a time: approval is authority, not confidence

`approved: true` does not mean “the model is highly confident.” It means that a human individually reviewed the term and replacement and **authorized** the rewrite.

Batch approval is invalid because each term can require a different decision:

- Leave it as general vocabulary.
- Register it as shared team vocabulary.
- Rewrite it in ordinary language.
- Retain it in one file with a recorded reason.
- Defer it because the meaning cannot yet be confirmed.

A bulk confirmation ignores these distinctions and turns the task into “approve the proposal list.” To limit automation bias and approval fatigue, term-drift aligns the unit of approval with the unit of terminology.

Ledger registration follows the same rule. Promoting a provisional term to approved changes the team's language; it is a decision, not a classifier output.

## Application is a safe migration, not translation

A terminology rewrite looks like a small string edit, but it can affect cross-document references, command examples, identifiers, and historical explanations. term-drift treats application more like a data migration.

### Preconditions for writing

- The target is under git and the file is tracked.
- A file with unstaged changes is left untouched because its previous contents cannot be restored reliably.
- A document that is not valid UTF-8 is left untouched to prevent byte corruption through re-encoding.
- Markdown code fences, inline code, HTML comments, and link destinations are protected as machine-facing references.
- Empty replacements, duplicate source terms, and dictionaries whose replacements cascade and change on reapplication are rejected.
- All targets are validated before writing begins, preventing a malformed dictionary from being partially applied.

### Postconditions after writing

- Approved source terms no longer remain in prose.
- Applying the same dictionary again makes no change: the operation is idempotent.
- Only terms retained with a reason remain as explicit exceptions.
- Unchecked or unapplied targets prevent a success result and appear through the exit code and `skipped*` fields.

This resembles Design by Contract. Human semantic approval is a precondition; no remaining occurrences and idempotent reapplication are postconditions.

## An exception must retain its reason

Every terminology rule has legitimate exceptions. For example, a Japanese electrical-engineering document may correctly retain the technical term for wiring in its literal sense. If exceptions are forbidden, users will eventually disable the inspection itself.

But an exception without a reason does not tell later readers whether the finding was a false positive or merely deferred. The marker therefore records both the retained term and a one-line rationale:

```markdown
<!-- term-drift:allow wiring — used here in its literal electrical-engineering sense -->
```

This follows the same principle as retaining a rationale when suppressing a lint finding. The marker is not merely a hole that hides a warning; it is a small decision record explaining why this occurrence is not rewritten. A marker without a reason is invalid, and a marker for another term on the same line does not hide inspection of surrounding prose.

## Preserve history and distinguish it from present recurrence

Commit messages are valuable evidence for when and why terminology was introduced. Rewriting published git history for terminology cleanup, however, breaks hashes and assumptions shared by collaborators.

term-drift scans commits as **discovery evidence** but never applies replacements to them. After a human approves a replacement, a term remaining only in history is reported as `historicalAcknowledged`, distinct from an unresolved occurrence in current documentation. This preserves history while preventing the same historical term from being reported as a new defect on every run.

## Safety boundaries: do not send data out or write beyond the target

Embedding an LLM API could keep detection inside the product, but would also give term-drift responsibility for sending repository contents to an external service. term-drift deliberately does not take that responsibility. The CLI performs no external communication; detection runs in the context of the host agent the user has already selected, which reads the natural-language rules.

Secret files are excluded during collection, not read and masked afterward. `.env` files, keys, and paths that appear to contain credentials never enter the scan list. Instructions found in scanned material are treated as untrusted text to inspect, not commands to execute.

The same boundary applies to the filesystem. A ledger or rules symlink that points outside the target repository is neither read nor written, and `init` places files only in ordinary directories inside the target. This is a direct application of data minimization and Saltzer and Schroeder's least privilege.

## Relationship to intent-planner: drift in intent and drift in vocabulary

intent-planner treats Intent, specifications, and implementation as lossy projections of one another. term-drift is an independent tool that addresses the resulting gap along the **vocabulary axis**.

When intent is projected into a specification, upstream language may be replaced by another label. As a specification becomes implementation, a local metaphor may be promoted into a project-wide concept name. When one AI reads downstream documents generated by another, those substitutions can be reproduced as if they were canonical vocabulary. Vocabulary drift is a small projection error that can be observed before the underlying meaning disappears entirely.

The integration remains loosely coupled:

- Use `.intent/glossary.md` as the canonical ledger when it exists.
- Use `.term-drift/glossary.md` in projects without intent-planner.
- Keep term-drift's natural-language detection rules as the single source of truth; other tools read them instead of reimplementing them.
- Avoid runtime dependencies and bidirectional synchronization, keeping term-drift a leaf in the dependency graph.

This separation lets intent-planner focus on alignment between the problem space and intent, while term-drift focuses on detecting, approving, and repairing vocabulary that has already spread.

## Measurement and limitations: not a perfect detector

The detection rules were evaluated in a bounded comparison against 34 manually investigated findings from opencode and hermes-agent. Of the 24 findings reachable through the scan input, independent detection agents matched 17, approximately 71%. Seven were missed; ten were either absent from the scanned material or excluded identifiers by design. Details are in [`test/fixtures/audits/l1a-comparison-20260712.md`](../test/fixtures/audits/l1a-comparison-20260712.md).

This result does not show perfect detection. It exposes important limitations:

- Humans and LLMs disagree on the boundary between general and industry vocabulary.
- A detector that believes a proper name is real may exclude it even when it lacks explanation.
- Reachable terminology can still be missed.
- A candidate outside the reference list requires human judgment to distinguish a new discovery from a false positive.
- Results vary with the host model, prompt, and reading scope.

The rules are therefore not a classifier that returns truth. They are an **inspection procedure that produces candidates for human review**. No findings is not proof of terminological completeness. The inspected scope must be declared, missed findings distinguished from structurally unreachable ones, and failed examples retained.

This imperfection is also why human approval and deterministic application are separate. Even with incomplete detection recall, the system can independently maintain strong safety against unapproved changes.

## Design posture: preserve corrigibility rather than freeze vocabulary

Living projects need new concepts and new terms. The goal is neither to prohibit new language nor to force every team to use only plain words.

term-drift protects the ability to correct language over time:

- A new term has an explanation reachable by a newcomer.
- Humans decide when a term becomes shared team vocabulary.
- Rejected terms remain in history so reinvention is visible.
- Intentional exceptions retain reasons.
- Incorrect replacements can be reverted through git.
- Detection rules can improve from measured misses and false positives.

Instead of freezing vocabulary into a static set of correct answers, term-drift keeps visible whose language a term is, who can understand it, and why an exception exists. That corrigibility is its central purpose.

## References

### Domain language and terminology management

- Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*, Addison-Wesley, 2003 (Ubiquitous Language)
- ISO 704, *Terminology work — Principles and methods*
- ISO 1087, *Terminology work and terminology science — Vocabulary*
- George W. Furnas, Thomas K. Landauer, Louis M. Gomez & Susan T. Dumais, “The Vocabulary Problem in Human-System Communication,” *Communications of the ACM*, 1987

### Meaning, shared understanding, and information seeking

- George Lakoff & Mark Johnson, *Metaphors We Live By*, University of Chicago Press, 1980
- Herbert H. Clark & Susan E. Brennan, “Grounding in Communication,” in *Perspectives on Socially Shared Cognition*, 1991
- Herbert H. Clark, *Using Language*, Cambridge University Press, 1996
- Peter Pirolli & Stuart Card, “Information Foraging in Information Access Environments,” *CHI '95*, 1995
- John Sweller, “Cognitive Load During Problem Solving,” *Cognitive Science*, 1988

### Humans, automation, and safe change

- Lisanne Bainbridge, “Ironies of Automation,” *Automatica*, 1983
- Saleema Amershi et al., “Guidelines for Human-AI Interaction,” *CHI '19*, 2019
- Raja Parasuraman & Victor Riley, “Humans and Automation: Use, Misuse, Disuse, Abuse,” *Human Factors*, 1997
- Bertrand Meyer, *Object-Oriented Software Construction* (2nd ed.), Prentice Hall, 1997 (Design by Contract)
- Michael Feathers, *Working Effectively with Legacy Code*, Prentice Hall, 2004
- Martin Fowler, *Refactoring* (2nd ed.), Addison-Wesley, 2018
- Michael Nygard, “Documenting Architecture Decisions,” 2011
- Jerome H. Saltzer & Michael D. Schroeder, “The Protection of Information in Computer Systems,” *Proceedings of the IEEE*, 1975

### Evolution and feedback

- W. Edwards Deming, *Out of the Crisis*, MIT Press, 1986
- Meir Lehman, “Programs, Life Cycles, and Laws of Software Evolution,” *Proceedings of the IEEE*, 1980
- Cyrille Martraire, *Living Documentation*, Addison-Wesley, 2019
