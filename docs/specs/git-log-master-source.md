---
status: confirmed
ceremony: standard
---
# `[!git]`: source commits from the default branch, not from branch tips

## §Why

- **Goal** — make `[!git]` report the work that actually **landed on the repository's default branch**, so a work log records shipped work. Today the selection is inverted: `loadBranchLogs` runs `git log <branch> --not <base>`, which yields only commits that are *not* on the base. A merged branch therefore returns zero lines and its section is dropped entirely (`git-log.ts:284`), while an unmerged branch contributes everything. Finished work disappears from the work log and unfinished work fills it.
- **Non-goals** — the `[!git]` spec syntax (path / `since:` / `until:` / `branches:`), the desktop-only guard, git binary discovery, the existing limits, and the per-commit rendering all stay as they are. No merge-strategy detection or configuration is introduced. No test framework or runtime dependency is added. Which memo-listed work the LLM selects stays where it is today — in the templates and `prompt.ts` output rules; this contract does not restructure that logic. (It does change two things the templates say: how a date block is dated, and that only landed work counts as shipped. Both follow from the goal and are specified below.)
- **Success criteria**
  1. A branch merged into the base appears in the GIT LOG with its own commits. (Today: absent.)
  2. Commits that exist only on a branch that was never integrated never appear under a landed section.
  3. A squash-merged or rebased branch's landing appears as a standalone landing entry — never an empty log.
  4. A commit made directly to the base appears.
  5. `[!git] <path>` with no branch selection sources the base, not the checked-out `HEAD` (today `git-log.ts:373` logs whatever is checked out).
  6. Every landed section's rendered landing date falls inside the `since:`/`until:` window, and the `work-log` template dates its blocks by that landing date. (Log-level and template-level halves stated separately because the preserved per-commit rendering keeps author dates, which may fall outside the window — see "Landing date".)
- **Preservation contract** — must survive unchanged: `parseGitSpec` (paths with spaces, `since`/`until`/`branch`/`branches` tokens, `today` and `<N>d` normalization); `branchCandidates` token rules; `globToRegExp` semantics; the desktop-only `Platform.isMobile` guard; `gitCandidates` + ENOENT-walk binary discovery; the error contract (`git.no-path`, `git.path-missing`, `git.failed`, `git.no-branches`, `git.desktop-only`) including "a missing path or non-repository is an error, never a silent memo-only transform"; `MAX_COMMITS` / `MAX_BRANCHES` / `GIT_TIMEOUT_MS`; the per-commit rendering (`=== %h %ad %an`, subject, body, `--stat` diffstat — author date, unchanged); and `loadGitLog`'s signature returning one freeform string that `prompt.ts:34` wraps in a single `=== GIT LOG ===` block.
- **Refactor rationale** — none. The change is confined to *which* commits `git-log.ts` selects. The existing `--not <base>` query survives, narrowed by `--cherry-pick` and re-labelled, rather than rewritten.

## §Spec

### Landing traversal (the new source)

For each repository spec, walk the base's **first-parent** history within the window. Each first-parent entry is one *landing*. The base is resolved by the existing `resolveBaseRef` (`origin/HEAD` → `origin/main` → `origin/master` → `main` → `master`); when it resolves to nothing, the repository falls back to today's plain `HEAD` log.

- A first-parent entry **with two or more parents** (a merge) expands to the commits it brought in: `git log <M>^@ --not <M>^1`. This is identical to `M^1..M^2` for an ordinary two-parent merge and stays correct for an octopus merge, where `M^1..M^2` would silently drop the third and later parents' commits.
- A first-parent entry **with one parent** is itself the landing — a direct commit, a squash-merge commit, or a rebased commit — rendered alone.

This partition is why no merge strategy needs detecting: squash and rebase landings are single-parent entries and appear as themselves; true merges expand. Verified by probe against a fixture carrying all four shapes.

### Landing date

The landing date is the first-parent entry's **committer date**, rendered `--date=short` (`%cd`). This is deliberately the same date git's `--since`/`--until` filter on, so a landing's rendered date always lies inside the window. The **per-commit** lines inside a section keep the preserved `%ad` author-date rendering and may therefore show dates outside the window — a June-authored commit that landed in July is exactly the case this contract exists to report.

### Section labels

```
--- landed <YYYY-MM-DD> branch: <name>          (merge landing, branch name parsed)
--- landed <YYYY-MM-DD> merge: <subject>        (merge landing, name not parseable)
--- landed <YYYY-MM-DD> direct                  (single-parent landing)
--- not yet on <base> branch: <name>            (selected branch, work not landed)
```

A merge landing's branch name is parsed from the merge subject, in order: `Merge branch 'x'` (with or without a trailing `into 'y'`), `Merge remote-tracking branch 'origin/x'`, `Merge pull request #N from org/x`. When none match, the raw subject is shown under the `merge:` label — a parse miss degrades to less signal, never to a guessed, wrong branch name. Labels are hardcoded English like the existing ones (`git-log.ts:285/292/343/381`); they are LLM-facing, not user-facing, so they carry no i18n.

### Not-yet-landed work

Emitted **only when branches are explicitly selected** (pasted branch names or `branches:<glob>`). A bare `[!git] <path>` has no signal for which branches are the author's, and enumerating every unmerged branch in a shared repository is noise bounded only by `MAX_BRANCHES`.

A selected branch is emitted under `--- not yet on <base>` when both hold:

1. `git log <base>...<branch> --right-only --cherry-pick` is non-empty — the existing `--not <base>` query narrowed by `--cherry-pick`, which additionally drops commits whose patch already landed under a different hash (rebase, cherry-pick), and
2. no landing in the window carries this branch's name.

**Reachability alone is not a landed-predicate, and this contract does not pretend otherwise.** A squash-merged branch's own commits are never ancestors of the base — the squash commit is a new commit with the base as its only parent — so condition 1 stays true forever, and `--cherry-pick` does not rescue it either (N commits' patches never equal 1 squashed patch; both probed). Condition 2 catches this only when the squash subject happens to name the branch, which GitHub's and GitLab's defaults do not. The residual is therefore real: **in a squash-merge repository, a selected branch whose work already landed may still be emitted under `not yet on <base>`, duplicating work that the landing already reports.**

This is closed at the prompt layer rather than the git layer, because git cannot answer it: a new `prompt.ts` git rule states that a landed section is the shipped record and wins over any not-yet-landed section describing the same work. This mirrors the existing transcript rule ("when the memo and the transcript conflict, the memo wins", `prompt.ts:55`). Consequence: the work log stays correct under every merge strategy; only the volume of the prompt suffers in the squash case.

### Selection

**Name filtering applies only to landings that have a name.** A nameless landing — every `direct` landing, which is to say every squash, rebase, and direct-to-base commit — is emitted regardless of selection. Only a merge landing carries a branch name (`:45`), so filtering nameless landings by name would drop them unconditionally: their name never matches because they have none. That is the single rule that keeps SC3 and SC4 true in every mode, and it is what gives the landed-wins rule below something to win with.

- **Pasted branch names** in the memo select which *named* landings are emitted: a merge landing whose parsed branch name matches a pasted name. A pasted branch that matches no landing and has unlanded work (per the two conditions above) contributes a not-yet-landed section. When no pasted name matches anything in a repository — neither a landing nor a branch ref — that repository falls through to the no-selection behavior below, as it does today (`git-log.ts:367`).
- **`branches:<glob>`** filters the same way: named landings by the glob, nameless landings always emitted, not-yet-landed sections for matching branches with unlanded work.
- **Neither present** — every landing in the window is emitted, no not-yet-landed section. (Matches the work-log template's existing "only when the memo provides no such list, include every user-visible change" clause.)

**Name filtering runs before the cap**, never after. Selecting from an already-capped set would let the cap evict a selected branch's landing in a repository with many landings — see Bounds. A11 pins this ordering.

#### Consequence by merge strategy — stated, not papered over

In a **merge-commit repository** every feature landing is named, so selection narrows as intended and the existing narrow-gate contract ("feeds exactly their commits") and its token economy hold: `git-log.ts` decides what the LLM may see, the templates decide what it writes. This is the strategy this contract is written against.

In a **squash or rebase repository** every landing is nameless, so selection cannot narrow, and two failure modes follow that a merge-commit repository does not have. Both are **accepted here and deferred to separate work**, not solved:

1. **Cap eviction.** The whole window's landings are emitted, capped at `MAX_BRANCHES`. Past that cap the surviving set is chosen by recency, without reference to what the user selected — so a selected branch's landing can be evicted and its shipped work go missing from the work log. This is the §Why failure mode reappearing, bounded to busy squash/rebase repositories.
2. **Lost match signal.** `work-log.md:58-66` keys issue↔work matching on the `--- branch:` header's ticket id and calls it "the strongest match signal"; `work-log.md:47-49` calls a pasted branch name "the most explicit form". No landing carries that header here, so matching degrades to topic inference against squash subjects (which carry a PR/MR number, not a ticket id), and `work-log.md:50/56` then instructs omission — "when unsure, omit".

Why accepted rather than closed: git does not retain the branch name of a squash landing (GitHub writes `<title> (#N)`, GitLab writes the MR title), so no reliable branch↔landing match exists to recover. Closing this would require patch-id or tree heuristics stacked on subject-format guesses. Against that cost, the status quo for these repositories is the inverted selection this contract removes — strictly worse than the degraded-but-honest behavior specified here.

### Bounds

`MAX_BRANCHES` (50) caps **each** section kind independently: at most 50 landings and at most 50 not-yet-landed branches per repository, each with its own over-cap notice (the existing notice at `git-log.ts:287-291`, reworded and emitted twice). The branch-side cap is today's `branches.slice(0, MAX_BRANCHES)` (`git-log.ts:264`) kept in place.

**Cap order is most-recent-landing first**, matching the existing branch-side order (`--sort=-committerdate`, `git-log.ts:186`) — the first-parent walk already yields this order, so the cap is a `slice`, not a re-sort. **The cap applies after name filtering** (see Selection): in a merge-commit repository selection narrows to the pasted branches' landings first, so the cap bites only past 50 *selected* landings, exactly as today's path does (`git-log.ts:357-360`). Where selection cannot narrow — squash and rebase repositories — the cap is what evicts, and that is the accepted failure mode named in Selection. `MAX_COMMITS` (200) and `GIT_TIMEOUT_MS` keep their meaning, applied per `git log` invocation via the preserved `logArgs`.

Costs this contract accepts, stated rather than assumed away: git invocations roughly double (one first-parent walk, plus one expansion per merge landing, plus one query per selected branch), each carrying its own 30s `GIT_TIMEOUT_MS` rather than sharing a budget; `--cherry-pick` adds patch-id computation the current query does not do; and the emitted worst case grows from today's 50 sections to 100 (50 landings + 50 not-yet-landed), each up to `MAX_COMMITS` commits with diffstats. In a squash or rebase repository, selection cannot narrow (see Selection), so the landed side runs at its cap far more often than today.

### Acceptance criteria

Against a fixture repository containing: a base commit, a `--no-ff`-merged branch, a never-merged branch, a squash-merged branch, a rebased-and-fast-forwarded branch, an octopus merge, and a direct commit —

- A1. The merged branch's commits appear under a `--- landed … branch:` section carrying its name — both with no selection and with that branch's name pasted.
- A2. With no branch selection, the never-merged branch's commits appear nowhere; with it pasted, they appear only under `--- not yet on <base>`, never under a landed section.
- A3. The squash landing appears under a `--- landed … direct` section — both with no selection **and with the squashed branch's name pasted** (the nameless-landing rule; this is the criterion that fails if name filtering is ever applied to nameless landings).
- A4. The direct commit appears under a `--- landed … direct` section, in both modes, even though no pasted name can match it.
- A5. With no branch selection, output is byte-identical whichever branch is checked out.
- A6. A window excluding a landing's committer date excludes that landing and all of its commits; a window including it includes all of its commits regardless of their author dates.
- A7. An octopus merge's third-parent commits appear under its landing section.
- A8. A branch rebased onto the base and fast-forwarded is reported exactly once: its commits appear as `direct` landings and it produces no not-yet-landed section (its `--cherry-pick` query is empty).
- A9. `buildPrompt` with a non-empty `gitLog` emits the landed-wins rule in `=== OUTPUT RULES ===`, and emits exactly one `=== GIT LOG ===` block (I4).
- A10. The preserved pure surfaces still hold: `parseGitSpec` on a path with spaces plus `since:7d`/`until:today`/`branches:` tokens, and `globToRegExp` on `feature/2026/*`.
- A11. **Filter-before-cap.** In a merge-commit fixture with more than `MAX_BRANCHES` named landings in the window, a pasted branch whose landing is older than the 50 most recent is still reported. (Fails if the cap is applied before name filtering. This criterion is stated for merge-commit repositories only — in a squash/rebase repository it is expected to fail, which is the accepted eviction failure mode named in Selection.)

### Invariants

- **I1.** Every commit rendered under a landed section is reachable from the base (`git merge-base --is-ancestor <commit> <base>` exits 0).
- **I2.** Every commit rendered under a not-yet-landed section is *not* reachable from the base. (The converse does not hold — see "Not-yet-landed work".)
- **I3.** Within one repository's output, no commit appears under two landed sections — the first-parent entries' expansions are pairwise disjoint. (Disjoint, not a cover: the merge commits themselves are rendered nowhere, since `<M>^@ --not <M>^1` excludes `M` and `work-log.md:93` skips merge commits as chores anyway.)
- **I4.** `loadGitLog` still returns one freeform string and `prompt.ts` still emits exactly one `=== GIT LOG ===` block.

### Verification

No test runner exists (`package.json` declares `lint` and `build` only), and `git-log.ts` imports `obsidian` at module top, so it cannot be required from plain node. Verification is one committed probe script, `scripts/probe-git-log.mjs`: it esbuild-bundles the module with an `obsidian` stub, builds the fixture repository above in a temp dir, and asserts A1–A10 plus I1–I3 with `node:assert`. No framework, no new dependency; run with `node scripts/probe-git-log.mjs`. The fixture additionally carries an octopus merge (A7) and a rebased-and-fast-forwarded branch (A8). `prompt.ts` imports types only, so A9 needs no fixture repository — it calls `buildPrompt` on a hand-built context. **A9 pins the rule's presence in the prompt, not the LLM's obedience to it** — nothing in this contract can test that the model actually lets a landed section win, and the squash residual (see "Not-yet-landed work") rests on that obedience. Stated plainly rather than dressed up: A9 catches the rule being dropped or reworded away, and nothing more. A10 doubles as the characterization net for the preserved pure surfaces — characterizing the inverted selection itself is pointless, since inverting it is the deliverable. The error contract, desktop guard, and binary discovery are preserved by not being touched; they carry no probe.

- allowed-surface:
  - `src/core/git-log.ts` — the landing traversal, labels, bounds referent.
  - `src/core/prompt.ts` — one added git output rule: a landed section wins over a not-yet-landed section describing the same work.
  - `starter-templates/work-log.md` — date blocks keyed to the landing date; only landed sections are work-log content; and the matching rules that key on the old `--- branch:` vocabulary (`work-log.md:47-49`, `58-66`) retargeted to the new labels, since those references go stale under this contract's label set.
  - `starter-templates/work-report.md` — "In progress / carried over" fed by not-yet-landed sections.
  - `src/core/starter-templates.ts` — generated from the two templates by the prebuild hook; never hand-edited.
  - `scripts/probe-git-log.mjs` — new.
  - `docs/architecture.md` — the `git-log.ts` row's one-line description.
  - `docs/specs/git-log-master-source.md` — this contract.
  - `README.md`, `README.ko.md` — the `[!git]` paragraph under "Extra sources".
  - `CHANGELOG.md` — the release entry.
- refactor-scope:
  - (none — surgical; §8 default applies)
