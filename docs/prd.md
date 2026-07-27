# ExcaVelo PRD

Product requirements — the "why" behind the spec. Developer spec index:
`../CLAUDE.md`. Template authoring rules: `templates-format.md`.

## Product

A user scribbles fragmented memo content in any note and triggers a transform;
the plugin turns it into a structured, durable record via Claude, previewed
before anything touches the vault.

## Users

- **Primary**: a Korean-speaking team sharing a single Claude Max subscription.
  They use the Claude Code CLI path and a work wiki vault (Karpathy LLM-wiki
  pattern) where transform outputs become ingested source documents.
- **Secondary**: individual Obsidian users on an Anthropic API key or an
  OpenAI-compatible endpoint (Ollama, Groq, ...), desktop or mobile.

## Core jobs

1. Turn memo shorthand into a readable record while the author still remembers
   what the shorthand meant (meeting minutes, 1:1s, decision records).
2. Feed the wiki: outputs saved to `wiki/sources/` are the input to the wiki's
   own ingest workflow. What the transform drops, the wiki never sees.
3. Never endanger the raw memo (hard rule: no overwrite by default).

## V1 functional requirements

Status snapshot as of 2026-07-05. The checklist tracks what v1 must ship;
implementation detail lives in `adapters.md` / `architecture.md`.

| Requirement | Status |
|---|---|
| Transform pipeline: context extraction, prompt build, provider call, preview | done |
| Claude Code CLI provider — detect (native + npm installs), ping, generate | done |
| Anthropic API provider — generate, ping (mobile path depends on this) | done (`requestUrl`, see `adapters.md`) |
| OpenAI-compatible provider — generate, ping | done |
| Provider parity: all three return the same `LlmResponse` semantics (text, tokens, cost when available) so the preview modal and status bar work identically | done (openai-compat reports tokens, no cost) |
| Preview actions: append, save-as-new (frontmatter merge), replace, copy, regenerate, discard | done |
| Template registry: folder scan + frontmatter parse | done |
| Starter templates copied into vault on first run | done (bundled into main.js via esbuild text loader; copied when the templates folder is empty) |
| Wiki config detection + output path/frontmatter mapping | done |
| Onboarding: CLI auto-detect, API-key path | done (CLI), minimal (API key) |
| Mobile: auto-fallback from CLI to API key per CLAUDE.md sec 3 | done (anthropic key first, then openai-compat key, else clear error) |
| Settings: connection test per provider | done (all three) |
| STT transcript input: [!stt] callout links transcript files into the prompt | done |
| Meeting starter split: meeting (cross-team) + task-meeting (internal), both essence-first over transcripts | done |
| Model selection: CLI dropdown (default sonnet) + per-template `model` frontmatter; API providers list models via "Load model list" | done |
| Korean UI: i18n string table + language setting (auto/en/ko) + `description_ko` in templates | done |
| CLI timeout exposed in settings (default 720s for long transcripts) | done |
| Git history input: [!git] callout runs git log on named repos (desktop); work-report + work-log starters | done |

All of the above ship on `main` as of 1.4.0. Remaining: a live-endpoint QA
pass for the API providers (verified against stubs so far).

## Output fidelity policy

The defining product decision, settled 2026-07-04. Earlier starter templates
baked in compression ("two to four short paragraphs", "three to five bullets"),
which silently destroyed meeting content. That approach is retired.

### Principle

Transforms are **preservation-first restructuring, not summarization**.

Scope (clarified 2026-07-05 after real STT runs): the completeness contract
protects the **raw memo** — author-curated, every item survives. An attached
STT transcript is a secondary source: templates select what matters from it
(decisions, numbers, constraints), never treat it as content to preserve
verbatim, and never trust its speaker labels.

Rationale:

- Downstream, the output is the source of truth (wiki ingest). The raw memo is
  author-only shorthand with a shelf life of days.
- A summary can always be regenerated from a complete record; the reverse is
  impossible. Omission cost is permanent; noise cost is a scroll.
- Memo input is already pre-filtered — the user wrote it down because it
  mattered. Aggressive relevance filtering by the model is double filtering.

### Contract

Enforced globally by the prompt builder (`src/core/prompt.ts` OUTPUT RULES),
so user-authored templates inherit it too:

1. **Item-level completeness** — every distinct fact, statement, name, number,
   date, and decision in the raw memo must appear in the output. Restructuring
   and deduplication are allowed; dropping content is not. When in doubt,
   include it.
2. **Length scales with input** — no length caps anywhere in the factual body.
3. **Interpretation quarantine** — model inference (takeaways, tone reading)
   is allowed only in sections explicitly labeled as interpretation, placed
   after the factual record.
4. **Language** — the entire output, section headings included, follows the
   language of the raw memo.
5. **Override** — a template may summarize only by saying so explicitly in its
   instruction. Explicit summary sections (e.g. Highlights) select *on top of*
   complete body sections, never instead of them.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-04 | Preservation-first for all five starter templates, not only meeting-minutes | One mental model; digest-style templates still get complete bodies plus explicit summary layers |
| 2026-07-04 | Contract lives in global OUTPUT RULES with template-level override | Protects user-authored templates by default without banning intentional summary templates |
| 2026-07-04 | Meeting minutes body = one subsection per topic, speaker attribution, verbatim quotes | Topic clustering beats chronology for wiki reuse; missing topics become structurally visible |
| 2026-07-04 | Keep interpretive sections, labeled and quarantined | Implication-capture is real product value; labeling prevents inference being cited as fact |
| 2026-07-04 | Item-level completeness wording (strong) over soft "don't omit" | In wiki source documents, omission cost far exceeds noise cost |
| 2026-07-04 | Output language = memo language, headings included | Readers are human and Korean; wiki ingest is LLM-driven and tolerant |
| 2026-07-04 | API providers use Obsidian `requestUrl`, not vendor SDKs | Bypasses CORS, identical behavior on mobile (the fallback path), smaller bundle; request shapes are trivial |
| 2026-07-04 | Starter templates bundled into main.js (esbuild text loader) | Obsidian releases ship only main.js/manifest/styles; repo files stay the source of truth |
| 2026-07-04 | Mobile fallback order: anthropic key, then openai-compat key, else error | Matches CLAUDE.md sec 3 preference; a configured key signals intent, default baseUrl alone does not |
| 2026-07-04 | STT transcripts attach via [!stt] callout wikilinks; memo wins on conflict | Memo is author-curated; 40+ min STT carries recognition errors, wrong attributions, and chatter. Unintelligible passages are marked ("(STT 손상 구간)"), never guessed |
| 2026-07-04 | meeting-minutes split into meeting (cross-team, selective) and task-meeting (internal, preservation-first) | Cross-team records are read for decisions and follow-ups, not the conversation; selection is the explicit-override case the fidelity contract already allows (rule 5). Internal task meetings keep the full preservation-first treatment |
| 2026-07-05 | No speaker attribution in meeting templates; participants never inferred from the transcript | Real STT runs: speaker labels are unreliable and STT invents attendees. What was decided matters; who said it does not. Participants come from the memo or a placeholder. Supersedes the 07-04 "speaker attribution, verbatim quotes" decision for meeting templates |
| 2026-07-05 | Both meeting templates consolidate toward key points / decisions / implications; labeled Implications section added | 40-min transcripts produced play-by-play narration; readers need outcome, not conversation. Memo completeness contract unchanged |
| 2026-07-05 | CLI model default `sonnet`; per-template `model` frontmatter; default timeout 720s | User's CLI default resolved to haiku (quality floor too low for minutes); long transcripts blew the 120s ceiling |
| 2026-07-05 | Git history via [!git] callout (path + since:/until:), message + diffstat only, desktop-only | Work reports need what-was-done from commits; full diffs blow tokens. Same callout mental model as [!stt]; log is ground truth, grouped by intent not commit-by-commit |
| 2026-07-05 | `branches:<glob>` per-branch mode: one log section per matching branch, default-branch commits subtracted (base..branch) | Real team keeps one branch per issue with ticket id/company/author in the name; trunk log misses unmerged work entirely, and a date-window branch log drags in inherited base commits (18 vs 3 own in a probe). Branch name is the strongest issue-match signal; inherited leftovers are attributed away by the LLM |
| 2026-07-05 | Memo issue list = selection criteria, not content: unmatched issue produces no entry; no reframing commits to force a match (git-conditional OUTPUT RULES + work-log template) | Harness runs against a real multi-dev repo: the global completeness rule forced a fabricated dated entry for a commit-less issue, and a timeout commit was reframed to fit an STT issue. Filtering semantics must override item-level completeness for filter items |
| 2026-07-05 | Branch selection is automatic: branch names pasted into the memo are looked up in the [!git] repositories (existence = the filter); no window on pasted branches; glob stays as an option | User's real flow is pasting `branch  subject` lines from git; requiring a `branches:` glob per transform is config noise. Existence-checking pasted tokens against real branches makes false positives impossible; a repo without pasted branches falls back to the plain checked-out log |
| 2026-07-15 | [!git] sources what landed on the default branch, not branch tips: one section per first-parent landing (a merge expands to the commits it brought in; anything else is its own landing), dated by the day it landed. Unlanded work is labelled `not yet on <base>` and never reported as shipped. Supersedes the 07-05 `base..branch` subtraction and the checked-out-branch fallback | `base..branch` selects what has *not* been merged: a landed branch returned nothing and its section vanished, so a work log recorded the unfinished work and omitted the finished work — the inverse of what a work log is for. Sourcing from the default branch also removes the need to detect a merge strategy: squash and rebase landings are single-parent entries and appear as themselves. Accepted cost, in squash/rebase repositories only: landings carry no branch name there, so pasted names cannot narrow the log and a branch may show as unlanded after its content shipped squashed (the templates resolve the latter — a landed section wins). Contract: docs/specs/git-log-master-source.md |
| 2026-07-15 | A pasted token that matches nothing in a given repository leaves that repository fully in the no-selection case, 7-day window included. Qualifies the 07-05 "existence = the filter" claim | `branchCandidates` accepts any slash-bearing token, so a memo mentioning `src/core/git-log.ts` or `2026/07/15` produces candidates — false positives are not impossible, only harmless *as a filter*. They were not harmless as a window signal: the first implementation of the above froze the window on the presence of a candidate rather than on the match, and a memo that merely named a file path walked the repository's entire history. The window must follow each repository's own selection outcome; `candidates` are computed once from the memo and shared across every spec |
| 2026-07-27 | `[!git]` confirms *which selected branches actually reached the base* — three checks in order: a landing whose message names the branch (no ref needed), every base-unique commit subject resolving to exactly one landing, or ancestry. A branch none confirms is reported nowhere, and `--- not yet on <base>` sections are removed from every selection mode. Under a selection, nameless landings are bounded by the window (7 days by default). Supersedes the 07-15 rows' not-yet-landed labelling and the unwindowed pasted mode | The 07-15 row accepted a residual for squash/rebase repositories, and it bit in practice: measured against the user's real repository (2414 landings, **zero** merge commits), not one of six pasted branch names appeared anywhere in the 55,080-character output, while squash-landed branches were labelled `not yet on <base>` — the exact inversion 07-15 set out to remove, wearing a different label. Tree-content comparison was measured and rejected as an evidence axis (shared files drift, so every branch stays "different" long after landing). Accepted cost, stated plainly: `[!git]` no longer reports in-progress work at all, and a squash that rewrites the subjects it absorbs leaves a branch unconfirmable — reported as nothing rather than as a guess. Contract: docs/specs/git-log-landed-confirmation.md |
| 2026-07-20 | Runtime verification of the completeness contract: transform → verify (missing-fact list vs raw memo + transcript key facts) → one conditional repair, opt-out toggle default on, fail-open, `[!git]` notes skipped. Lifts the v1 out-of-scope deferral below | Prompt-level enforcement requests completeness but never checks it; single-shot LLMs do drop facts, and omission cost dominates in wiki source documents (07-04 decision). A verify→repair chain makes the contract observable to the user (preview badge). Contract: docs/specs/completeness-verify-chain.md |

## Out of scope

See `../CLAUDE.md` section 8. ~~Additionally out of scope for the fidelity
policy: runtime verification of the completeness contract (diffing output
against memo items) — prompt-level enforcement only for v1.~~ Lifted
2026-07-20 (decision log above; contract: docs/specs/completeness-verify-chain.md).
