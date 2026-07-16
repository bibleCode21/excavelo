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
- **Preservation contract** — must survive unchanged: the **window rule** — a repository whose pasted selection matches takes no default window (`since` stays whatever the spec set, `null` = all history), and one whose selection matches nothing takes the 7-day `DEFAULT_SINCE`, exactly as if the memo had named nothing (`git-log.ts:341,362,370`); `parseGitSpec` (paths with spaces, `since`/`until`/`branch`/`branches` tokens, `today` and `<N>d` normalization); `branchCandidates` token rules; glob-match semantics (case-insensitive, `*` crosses slashes and matches zero or more characters, `?` matches exactly one, everything else literal) — **not** `globToRegExp` itself, which Round 2 replaced outright (see allowed-surface); the desktop-only `Platform.isMobile` guard; `gitCandidates` + ENOENT-walk binary discovery; the error contract (`git.no-path`, `git.path-missing`, `git.failed`, `git.desktop-only`) including "a missing path or non-repository is an error, never a silent memo-only transform" — **`git.no-branches` is the one exception and does not survive unchanged**: its key and message do, its raise condition narrows, per §Spec "Selection", which governs; `MAX_COMMITS` / `MAX_BRANCHES` / `GIT_TIMEOUT_MS`; the per-commit rendering (`=== %h %ad %an`, subject, body, `--stat` diffstat — author date, unchanged); and `loadGitLog`'s signature returning one freeform string that `prompt.ts:34` wraps in a single `=== GIT LOG ===` block.
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

**Name filtering applies only to landings that have a name.** A nameless landing — every `direct` landing, which is to say every squash, rebase, and direct-to-base commit — is emitted regardless of selection. Only a merge landing carries a branch name (`branch: parentList.length >= 2 ? parseMergeBranchName(subject) : null` in `git-log.ts`), so filtering nameless landings by name would drop them unconditionally: their name never matches because they have none. That is the single rule that keeps SC3 and SC4 true in every mode, and it is what gives the landed-wins rule below something to win with.

- **Pasted branch names** in the memo select which *named* landings are emitted: a merge landing whose parsed branch name matches a pasted name. A pasted branch that matches no landing and has unlanded work (per the two conditions above) contributes a not-yet-landed section. When no pasted name matches anything in a repository — neither a landing nor a branch ref — that repository falls through to the no-selection behavior below, as it does today (`git-log.ts:367`).
- **`branches:<glob>`** filters the same way: named landings by the glob, nameless landings always emitted, not-yet-landed sections for matching branches with unlanded work.

  **`git.no-branches` narrows here, and this is the one place the error contract is not preserved verbatim.** It used to throw iff no *branch ref* matched the glob; it now throws only when the glob matches neither a branch ref nor a landing's name. The key and the message are unchanged — the raise site's condition is not. The narrowing is forced by the goal: a branch merged and then deleted (GitLab and GitHub both offer this on merge, and A13's fixture depends on it) has no ref left, so the old condition would raise "no branches match" over a glob whose work is sitting right there in the landings. Erroring on work that plainly landed is the §Why failure mode wearing an exception.
- **Neither present** — every landing in the window is emitted, no not-yet-landed section. (Matches the work-log template's existing "only when the memo provides no such list, include every user-visible change" clause.)

#### The window rule — both halves, and how the cycle breaks

Which window a repository gets follows **that repository's own selection outcome**, and nothing else:

- **A pasted name matches** (a landing or a branch ref) → **no default window**. `since` is whatever the spec set, `null` included, and `null` means all history. This is preserved behavior, not new: an explicit selection is not silently bounded to a week, or a branch that landed a month ago would report nothing. (Today's `git-log.ts:362`; documented at `prd.md`'s 07-05 row and `templates-format.md`.)
- **A pasted name matches nothing here** → the no-selection case **entirely**, window included: the 7-day default, exactly as a memo with no pasted names would take. `branchCandidates` accepts any slash-bearing token, so a memo mentioning a file path is the ordinary case, not an exotic one — and `candidates` is computed once from the memo and shared across every spec, so a name matching in one repository must not reach into another's window.
- **`branches:<glob>`, or no candidates at all** → the 7-day default unless the spec sets one. A glob never falls through (it throws `git.no-branches`), so its window is fixed up front. The rationale for the match half applies just as well to a glob, which is also an explicit selection — but the glob keeps its 7-day default: that asymmetry is today's behavior, preserved as-is, and re-opening it is not this work's business.

These two halves are circular against the match rule above: the outcome needs the landings, and the landings need a window. **Break it by reading wide, then narrowing** — enumerate at the widest window the spec allows, decide the outcome against that set, and only re-read narrowed if nothing selected here. Reading narrow first is wrong, not merely slower: a landing older than the default window whose source branch was deleted after merge — the ordinary GitHub flow — would be invisible to the match test, and the fall-through would then lock in the very default that hid it.

A12 pins the no-match half; A13 pins the match half. Both are in the preservation contract (§Why).

**Name filtering runs before the cap**, never after. Selecting from an already-capped set would let the cap evict a selected branch's landing in a repository with many landings — see Bounds. A11 pins this ordering.

#### Consequence by merge strategy — stated, not papered over

In a **merge-commit repository** every feature landing is named, so selection narrows as intended and the existing narrow-gate contract ("feeds exactly their commits") and its token economy hold: `git-log.ts` decides what the LLM may see, the templates decide what it writes. This is the strategy this contract is written against.

In a **squash or rebase repository** every landing is nameless, so selection cannot narrow, and two failure modes follow that a merge-commit repository does not have. Both are **accepted here and deferred to separate work**, not solved:

1. **Cap eviction.** The whole window's landings are emitted, capped at `MAX_BRANCHES`. Past that cap the surviving set is chosen by recency, without reference to what the user selected — so a selected branch's landing can be evicted and its shipped work go missing from the work log. This is the §Why failure mode reappearing, bounded to busy squash/rebase repositories.
2. **Lost match signal.** `work-log.md:58-66` keys issue↔work matching on the `--- branch:` header's ticket id and calls it "the strongest match signal"; `work-log.md:47-49` calls a pasted branch name "the most explicit form". No landing carries that header here, so matching degrades to topic inference against squash subjects (which carry a PR/MR number, not a ticket id), and `work-log.md:50/56` then instructs omission — "when unsure, omit".

Why accepted rather than closed: git does not retain the branch name of a squash landing (GitHub writes `<title> (#N)`, GitLab writes the MR title), so no reliable branch↔landing match exists to recover. Closing this would require patch-id or tree heuristics stacked on subject-format guesses. Against that cost, the status quo for these repositories is the inverted selection this contract removes — strictly worse than the degraded-but-honest behavior specified here.

### Bounds

`MAX_BRANCHES` (50) caps **each** section kind independently: at most 50 landings and at most 50 not-yet-landed branches per repository, each with its own over-cap notice (the existing notice at `git-log.ts:287-291`, reworded and emitted twice). The branch-side cap is today's `branches.slice(0, MAX_BRANCHES)` (`git-log.ts:264`) kept in place.

**Cap order is most-recent-landing first**, matching the existing branch-side order (`--sort=-committerdate`, in `enumerateBranches`) — the first-parent walk already yields this order, so the cap is a `slice`, not a re-sort. **The cap applies after name filtering** (see Selection): in a merge-commit repository selection narrows to the pasted branches' landings first, so the cap bites only past 50 *selected* landings, exactly as today's path does (the `selected` computation in `loadGitLog`). Where selection cannot narrow — squash and rebase repositories — the cap is what evicts, and that is the accepted failure mode named in Selection. `MAX_COMMITS` (200) and `GIT_TIMEOUT_MS` keep their meaning, applied per `git log` invocation via the preserved `logArgs`.

Costs this contract accepts, stated rather than assumed away: git invocations roughly double (one first-parent walk, plus one expansion per merge landing, plus one query per selected branch), each carrying its own 30s `GIT_TIMEOUT_MS` rather than sharing a budget; `--cherry-pick` adds patch-id computation the current query does not do; and the emitted worst case grows from today's 50 sections to 100 (50 landings + 50 not-yet-landed), each up to `MAX_COMMITS` commits with diffstats. In a squash or rebase repository, selection cannot narrow (see Selection), so the landed side runs at its cap far more often than today.

**The landing walk itself is uncapped, deliberately, and this is the one cost with no constant behind it.** `enumerateLandings` does not go through `logArgs`, so `MAX_COMMITS` never applies to it, and in pasted mode `since` is `null` — so the walk covers the base's entire first-parent history, bounded only by `GIT_TIMEOUT_MS`. That is not an oversight to fix with a constant: capping the *walk* would break A11 and A13 (a selected branch's landing must survive even when it is neither recent nor within a default window), and the read-wide-then-narrow rule above requires the wide read. What bounds it in practice is that a first-parent walk emits one short line per commit and git is fast; what bounds it in the worst case is the timeout. The cap belongs after selection, on what is *rendered*, which is where `MAX_BRANCHES` sits.

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
- A9. `buildPrompt` with a non-empty `gitLog` emits **both** git rules in `=== OUTPUT RULES ===` — the label vocabulary (what a landed and a not-yet-landed section mean) and landed-wins — and emits exactly one `=== GIT LOG ===` block (I4). Both, because landed-wins is meaningless to a reader who was never told what a landed section is.
- A10. The preserved pure surfaces still hold: `parseGitSpec` on a path with spaces plus `since:7d`/`until:today`/`branches:` tokens, and glob-match semantics on `feature/2026/*`.
- A11. **Filter-before-cap.** In a merge-commit fixture with more than `MAX_BRANCHES` named landings in the window, a pasted branch whose landing is older than the 50 most recent is still reported. (Fails if the cap is applied before name filtering. This criterion is stated for merge-commit repositories only — in a squash/rebase repository it is expected to fail, which is the accepted eviction failure mode named in Selection.)
- A12. **The default window survives a fall-through.** `[!git] <path>` with no `since:`, against a memo containing a slash-token that matches nothing in the repository (a file path such as `src/core/git-log.ts`, or a date such as `2026/07/15` — `branchCandidates` accepts both), reports the 7-day window, identically to a memo containing no slash-token at all. The window a repository ends up with must be decided from that repository's *own* selection outcome, never from the mere presence of a candidate in the memo: the memo is shared across every spec, so one repository's match must not silently drop another's default window. (This criterion exists because the first implementation froze `since` before the outcome was known and lost the default on every fall-through — a full-history walk, from a memo that merely mentioned a file path.)
- A13. **A matched pasted selection takes no default window.** `[!git] <path>` with no `since:`, against a memo naming a branch that *does* match, reports every landing carrying that name however old — including one older than `DEFAULT_SINCE`, and including the case where the source branch was deleted after merge so the name matches only a landing. (Fails if the fix for A12 applies the default to the matching case too; fails if the match is tested against a narrow window.)
- A14. **The glob matcher never backtracks, against any glob shape.** A `branches:` glob, against a fixture whose merge subject carries a ~100k-character branch name, returns in well under a second — tested with both an adjacent star run (`**/hotfix`) and several single stars separated by literals (`a*a*a*a*a*a*a*a*zzz`, no `**` anywhere). Reached through `loadGitLog` exactly as A10's globs are: the matcher is not exported, and **must not be exported to make this testable** — §Why preserves its semantics, and widening the module's public surface for a test is not licensed.

  This criterion's history matters: the first fix collapsed only *adjacent* star runs in a regex translation (`/\*+/g` → one `.*`), which closed the `**/hotfix` shape but left literal-separated stars compiling to chained `.*` segments — still exponential, and exactly what the security review's own reproduction used to show the first fix was cosmetic (measured independently at 7531ms and ~12s respectively for the two shapes, against the same 100k input, versus under 1s for either against the current non-regex matcher). The fix this criterion now pins is not a better regex — it's no regex at all: a two-pointer matcher bounded at O(text length × glob length), which cannot backtrack because it never recurses or re-tries a match beyond the single most recent `*`.

  A glob that matches immediately (a bare `**`) or fails at a literal prefix exercises no work either way and would pass vacuously against the very bug this criterion exists to catch — a real trap that caught both this contract's author and its reviewer the first time around. Both shapes above fail late (the subject never contains the trailing literal), which is what makes the timing discriminate.

  (A10's globs carry a single star each, so without A14 a regression to a backtracking implementation of either shape passes every other criterion.)

  **A third round found the matcher itself, not just its shape-coverage.** A two-pointer matcher has no exponential term, but it is still O(text length × glob length) in the worst case (a star followed by a literal that mismatches only at its very last character forces a full re-scan of the literal at every shift). Text length is out of this function's control by design (the whole point is a third party's merge subject), so the fix bounds the other factor: `MAX_GLOB_LENGTH` (200) makes any longer glob match nothing, same outcome as any other glob that selects zero branches. A14 covers both: a glob over the cap is refused regardless of shape (even a glob of nothing but stars, which would otherwise match everything), and a worst-case-shaped glob sitting exactly at the cap boundary still returns in well under a second against the 100k-character subject — the bound has to hold at its own edge, not just comfortably under it.
- A15. **The templates say what SC6's second half claims.** `work-log.md` no longer instructs "Date = commit date" and instead keys date blocks to the landing header's date; it states that a not-yet-landed section is never work-log content. `work-report.md` feeds not-yet-landed sections to "In progress / carried over". String assertions against the generated `starter-templates.ts`, on A9's precedent — these are shipped LLM instructions, so a reworded-away rule is a silent behavior change with no other check behind it.
- A16. **A pasted selection outranks recency when the cap bites.** In a fixture with one named merge landing older than `MAX_BRANCHES` more-recent nameless (direct) commits, pasting that branch's name still reports its landing. (Fails if nameless landings — which the nameless-landing rule keeps unconditionally, per A3 — are allowed to fill every cap slot ahead of a landing the caller explicitly selected; this is the shape A11 does not cover, since A11's own fixture has no nameless landings competing for slots.)

### Invariants

- **I1.** Every commit rendered under a landed section is reachable from the base (`git merge-base --is-ancestor <commit> <base>` exits 0).
- **I2.** Every commit rendered under a not-yet-landed section is *not* reachable from the base. (The converse does not hold — see "Not-yet-landed work".)
- **I3.** Within one repository's output, no commit appears under two landed sections — the first-parent entries' expansions are pairwise disjoint. (Disjoint, not a cover: the merge commits themselves are rendered nowhere, since `<M>^@ --not <M>^1` excludes `M` and `work-log.md:93` skips merge commits as chores anyway.)
- **I4.** `loadGitLog` still returns one freeform string and `prompt.ts` still emits exactly one `=== GIT LOG ===` block.

### Verification

No test runner exists (`package.json` declares `lint` and `build` only), and `git-log.ts` imports `obsidian` at module top, so it cannot be required from plain node. Verification is one committed probe script, `scripts/probe-git-log.mjs`: it esbuild-bundles the module with an `obsidian` stub, builds the fixture repository above in a temp dir, and asserts A1–A16 plus I1–I4 with `node:assert`. No framework, no new dependency; run with `node scripts/probe-git-log.mjs`. The fixture additionally carries an octopus merge (A7) and a rebased-and-fast-forwarded branch (A8). `prompt.ts` imports types only, so A9 needs no fixture repository — it calls `buildPrompt` on a hand-built context. **A9 pins the rules' presence in the prompt, not the LLM's obedience to them** — nothing in this contract can test that the model actually lets a landed section win, and the squash residual (see "Not-yet-landed work") rests on that obedience. Stated plainly rather than dressed up: A9 catches a rule being dropped or reworded away, and nothing more. A10 doubles as the characterization net for the preserved pure surfaces — characterizing the inverted selection itself is pointless, since inverting it is the deliverable. The desktop guard and binary discovery are preserved by not being touched; they carry no probe. Neither does the error contract, but for a weaker reason: its raise sites are rewritten and re-raise the same keys, and `git.no-branches` narrows outright (§Selection) — so "untouched" is not the justification there, and the behavioral-equivalence check belongs to `correctness` reading the code, not to a probe.

- allowed-surface:
  - `src/core/git-log.ts` — the landing traversal, labels, bounds referent. Also the glob matcher: this work newly routes unbounded text from a third party's commit subjects into it, so its ReDoS exposure is reachable for the first time and is this work's to close. `globToRegExp` (regex-based) is replaced outright by `globMatch` (a two-pointer matcher, no regex) — an adjacent-star-only collapse was tried first and found insufficient (a literal-separated-star glob still backtracks against it), so the fix removes the regex rather than patching it further. Semantics-preserving (same case-insensitive `*`/`?` matching, same inputs match) for any glob at or under the new `MAX_GLOB_LENGTH` (200, a new constant — no preserved glob was ever this long, so it does not breach the preservation contract), which the matcher itself needed once a two-pointer matcher's own O(text length × glob length) bound was found to still be quadratic against an adversarial glob paired with an adversarial subject — see A10/A14.
  - Also the not-yet-landed cap ordering (`loadLandingSections`'s `selected` computation): a pasted-name match is placed ahead of nameless landings before the `MAX_BRANCHES` slice, so nameless landings — which the nameless-landing rule keeps unconditionally — cannot fill every slot ahead of a landing the caller explicitly selected. See A16.
  - `src/core/prompt.ts` — the git output rules for the new label vocabulary: what a landed and a not-yet-landed section mean, and that a landed section wins over a not-yet-landed one describing the same work.
  - `starter-templates/work-log.md` — date blocks keyed to the landing date; only landed sections are work-log content; and the matching rules that key on the old `--- branch:` vocabulary (`work-log.md:47-49`, `58-66`) retargeted to the new labels, since those references go stale under this contract's label set.
  - `starter-templates/work-report.md` — "In progress / carried over" fed by not-yet-landed sections.
  - `src/core/starter-templates.ts` — generated from the two templates by the prebuild hook; never hand-edited.
  - `scripts/probe-git-log.mjs` — new.
  - `docs/architecture.md` — the `git-log.ts` row's one-line description.
  - `docs/templates-format.md` — **both** stale blocks in the `[!git]` section: the branch-selection paragraph (`:102-114`), which describes the selection this work removes and would otherwise survive as the repository's user-facing reference for behavior that no longer exists, and the work-list paragraph (`:116-120`), whose "a pasted branch name selects exactly that branch's commits" and "strongest match signal" claims are the ones §Selection documents as degraded.
  - `docs/prd.md` — one appended decision row superseding the `base..branch` and checked-out-fallback decisions this work reverses. Append-only: the existing rows are dated history and stay.
  - `docs/specs/git-log-master-source.md` — this contract.
  - `README.md`, `README.ko.md` — the `[!git]` paragraph under "Extra sources", including both accepted failure modes, not just the lost match signal.
  - `CHANGELOG.md` — the release entry, same disclosure.
- refactor-scope:
  - (none — surgical; §8 default applies)
