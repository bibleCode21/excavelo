---
status: confirmed
ceremony: standard
---
# probe-git-log structural split

## §Why

- **Goal**: split `scripts/probe-git-log.mjs` (4372 lines, 182 checks, 26 fixture
  builders, 27 sequential sections, one file) into an entry point plus a
  small set of modules cut along the existing section-group lines, so that a definition
  and its use stop living thousands of lines apart. Closes the last open bullet of
  deferred-followups item 17 (`probe 구조적 피로`), which prior units named a non-goal
  "sized for its own unit" (`git-log-comment-and-dead-code-cleanup.md` §Why).
- **Non-goals**: no check is reordered, renamed, or reworded; no assertion body,
  fixture body, or comment text is rewritten; no section header string changes; the
  entry path `node scripts/probe-git-log.mjs` is unchanged — `ci.yml:34` and every
  confirmed contract that runs the probe quote it verbatim; that is ten of the eleven
  files `grep -rl "node scripts/probe-git-log.mjs" docs/specs/` returns, the eleventh
  being this draft. Splitting
  `fixtures.mjs` further, or dissolving the cross-module coupling, is out of scope: this
  unit makes that coupling *visible* (an `import`), it does not remove it.

  Outside this contract, seven comments in six files name the probe in prose (five spell
  `probe-git-log.mjs`; `probe-release-metadata.mjs:36` and `ci.yml:37` drop the `.mjs`).
  **Five survive unchanged** and are left alone: `probe-settings-tab.mjs:9`,
  `probe-transform-preservation.mjs:12`, `probe-verify-chain.mjs:7` and
  `probe-release-metadata.mjs:36` cite it for the
  *esbuild-bundle-against-an-`obsidian`-stub* convention, which the split does not
  touch, and `ci.yml:37` names the probe without a path. **Two do not** —
  `probe-transform-preservation.mjs:54` and `src/core/git-log.ts:1090`, each naming the
  probe file as the home of something the split moves out of it — and commit 3 fixes
  both.

  **Positional comments inside the probe are knowingly left stale.** Roughly fifteen
  comments say "above", "below", or "this file" about a neighbour that is now in a
  sibling module (`:145`, `:261`, `:350`, `:853`, `:1047`, `:1400`, `:1653`, `:2497`,
  `:3497`, and the "this file" claims at `:1741`, `:3047`, `:3494`, `:4154`, `:4264`,
  `:4323`). Rewriting them would cost P4 — the diff would stop being a mechanically
  checkable move, which is what makes commit 1 reviewable at this size — while buying
  nothing criterion 1 can see, since stdout does not depend on comment text. The
  per-module docblocks carry the orientation instead; `fixtures.mjs`'s says so in as
  many words. The one that states a *rule* rather than a location, the retained entry
  docblock's fixture-date boundary requirement (`:21-30`, "pinned to an explicit instant
  below"), is handled the other way: the entry's new layout note says that rule governs
  the modules it imports (P4 makes that sentence part of commit 1).
- **Success criteria** (all measured, not asserted):
  1. **Green path.** `node scripts/probe-git-log.mjs` stdout is **byte-identical** to
     the pre-change baseline except the three lines that embed a measured elapsed time
     (`:2564`, `:2587`, `:2623` — the only non-deterministic stdout in the probe) —
     proved by `diff` against the captured baseline with those three figures
     normalized. Byte identity covers check count (182), check names, check order,
     section headers, and the `all passed` tail together; no weaker restatement is used.
     Exit code 0, `182` `ok` lines, `0` `FAIL` lines.
  2. **Red path.** The split separates the failure accumulator (`failures`, harness) from
     the exit-code decision (entry) and from a *second, direct* push site
     (`probe-git-log.mjs:1390`, inside the `globCases` loop, which lands in
     `selection-and-traversal.mjs`); three modules must share one array, and a broken
     sharing is invisible to criterion 1 — all-green stdout, exit 0. So the red path is
     measured separately, by two temporary mutations reverted before commit:
     - (a) make one existing check in `base-naming.mjs` throw → stdout carries its
       `  FAIL <name>` line, the tail is `\n1 failed`, exit code is 1;
     - (b) make one `globCases` entry in `selection-and-traversal.mjs` throw *through
       the `:1390` push site* (not through `check`) → same three observations.

     Both mutations are discarded; criterion 1's run is the committed state.
  3. `node scripts/probe-release-metadata.mjs` stays green — its
     `every scripts/probe-*.mjs is run by an uncommented line in ci.yml` check does a
     **flat, non-recursive** `readdirSync("scripts")` filtered on `probe-` + `.mjs`, so
     the new modules must live in a subdirectory (`scripts/probe-git-log/`) rather than
     as sibling `scripts/probe-*.mjs` files, which would demand ci.yml wiring they must
     not have. The same shape keeps `ls scripts/probe-*.mjs` — the enumeration the
     profile's `## test-strategy` prescribes — returning exactly today's six entries.
  4. Every module is cut on a boundary in the table below, and no check-bearing file
     exceeds 900 lines. `fixtures.mjs` is exempt: it is 21 independent builders with no
     control flow between them, and splitting it further is a non-goal above. If a
     module would exceed the cap, the boundary moves and the table is amended — the cap
     wins over the table, never the reverse.
  5. The profile's `knowledge/review-scope.md` `## test-strategy` carries a clause
     naming the scope of its test-idiom sentence — *both* halves, "one self-contained
     script per subject" and "no shared helper module", since this split contradicts
     each of them for the git-log probe and neither for any other (below), written at
     unit closure. Outside the repo diff, but not outside the unit.
- **Preservation contract**: the probe's observable behavior is its stdout **and** its
  exit code; criterion 1 covers the first and the green exit, criterion 2 covers the
  red exit and the `FAIL` reporting path. The probe is itself the safety net for
  `src/core/git-log.ts`, so a silently weakened probe — one that can no longer go red —
  is the failure mode this contract exists to exclude, and it is the one axis a
  byte-identity oracle is blind to. Nothing in `src/` behaves differently: the only
  `src/` edit in this unit is a comment (commit 3), so `git-log.ts` behavior is
  preserved trivially.
- **Refactor rationale**: the file's cost is measured, not aesthetic. `repo` is built at
  `:1364` and consumed through `:4004`; `noSelection` at `:1473` is consumed by E5 at
  `:3935`; `many` is built at `:2257` and consumed by C9 at `:3711`, 1454 lines and two
  section groups later. Those three are instances, not the whole set: dozens of
  top-level bindings are read outside the section that declares them, with nothing at
  the reading site marking where to look — a reader has to scan. Turning each into a
  named `export`/`import` is what removes the scan, and it cannot be done without moving
  the code. (No count is given because it moves with where one draws a section; the
  boundaries in §Spec determine the exact set, and P2 fixes where each one is declared.)

## §Spec

Observable behavior after the change: unchanged (see the preservation contract). The
change is a file-boundary move plus the `import`/`export` lines the boundaries force.

**Module boundaries** — cut on the existing `console.log` section sequence, grouped by
the fixture cluster each range asserts against. A section's introductory docblock
belongs to that section, so a boundary falls above the docblock, not below it. Line
numbers are of the pre-change file. The ranges are pairwise disjoint and, together with
the blank lines at 41, 140, 1267, 4365, cover every line **except the import block at
32–40**: those eight `import` statements are not moved but re-derived per module, since
each module needs its own subset (P4 licenses the added `import` lines).

| file | source range | contents |
|---|---|---|
| `scripts/probe-git-log.mjs` (entry) | 1–31, 4366–4372 | module docblock, a new layout note, its own `import`s, ordered imports of the modules below, tmp cleanup, exit code |
| `probe-git-log/harness.mjs` | 42–139, 1229–1266 | `tmp`, window polyfill, `MAX_BRANCHES`/`MAX_GLOB_LENGTH`, `failures`/`check`, `loadModule` and the bundled module's exports, `makeGit`, `at`, `sections`/`landedSections`/`section`/`hasSubject`/`countOf` |
| `probe-git-log/fixtures.mjs` | 141–1228 | 21 of the 26 `build*Fixture` builders and the three constants declared beside them — `TABBED_SQUASH_SUBJECT` (fixture-private) plus `TABBED_MERGE_SUBJECT` and `HUGE_NAME_LENGTH`, which cross a boundary and so become exports under P2; the other five builders are the marker-spoofing fixtures, in that row |
| `probe-git-log/selection-and-traversal.mjs` | 1268–1737 | `parseGitSpec`, `branchCandidates`, `expandHome`, `globMatch`, `selectBranches`, landing traversal (A1–A8), invariants (I1–I3); also `tryLoad`, which stays here beside the `matches` helper its comment names |
| `probe-git-log/marker-spoofing.mjs` | 1738–2206 | section-marker forging (item 7), record-marker spoofing (item 11), and the five spoofing fixtures nothing else uses |
| `probe-git-log/caps-and-windows.mjs` | 2207–2735 | prompt rules (A9), filter-before-cap (A11), scan cap, A16, default window (A12), glob backtracking (A14) and its three timing lines, templates (A15) |
| `probe-git-log/confirmation.mjs` | 2736–3541 | landed confirmation (B1–B16), panel regressions, landing record parsing, the spawn-layer predicate |
| `probe-git-log/base-naming.mjs` | 3542–4364 | named window invariance (C1–C9), the write-boundary characterization, base-named merge parses (E1–E7), cap priority, the windowed-out path, path-1 renames, base-naming edges (F1–F7) |

**Commits** — three, each with its own acceptance:

1. **The move.** Criteria 1–4. Its diff is moved lines, `import`/`export` statements,
   and one docblock per module; no moved line's content changes (P4).
2. **The dead `M1` arm.** `probe-git-log.mjs:4036`'s regex
   `/(?:^--- landed \S+ branch: |branch: )…/` — the first alternative ends in
   `branch: `, which the second alternative matches on its own at the same end
   position, so the first is subsumed and the regex's language is unchanged without it.
   That argument is the proof: the arm sits inside `assert.ok(!/…/.test(header))`, so a
   *narrowed* regex would be stdout-neutral too — exactly the silent-weakening axis
   criterion 1 cannot see. Re-running criterion 1 against the *same* pre-change baseline
   after this commit (not a new one) is the guard, not the evidence.
3. **The two pointers at content that leaves the file.** Both are comment-only, and
   both are the same defect class: a comment naming `probe-git-log.mjs` as the *home*
   of something the split moves out of it.
   - `src/core/git-log.ts:1090` reads "F1 in `scripts/probe-git-log.mjs` is the check
     that holds it"; F1 is at `:4167`, inside the 3542–4364 range → re-pointed to
     `scripts/probe-git-log/base-naming.mjs`.
   - `scripts/probe-transform-preservation.mjs:54` reads "(same polyfill as
     probe-git-log.mjs)", naming `globalThis.window ??= …` at `probe-git-log.mjs:47`,
     inside the 42–139 range → re-pointed to `probe-git-log/harness.mjs`.

   Acceptance: criterion 1 re-runs against the same baseline, `pnpm build`
   (`tsc -noEmit` + esbuild) stays clean, and `node scripts/probe-transform-preservation.mjs`
   stays green.

**Invariants**

- **P1 — order is the contract.** Six of the eight rows are a single range; the ranges
  keep their original relative order, and each module imports only from modules earlier
  in that order, so the graph is acyclic and ESM's depth-first evaluation reproduces the
  original top-to-bottom execution. Two rows are two ranges each, and each is
  order-neutral for its own reason: the **entry** (1–31 + 4366–4372) evaluates its body
  after every module it imports, which is where the teardown belongs anyway; the
  **harness** (42–139 + 1229–1266) hoists its second range — including the
  side-effecting `loadModule()` at `:1265` — over 141–1228, which is inert (21 function
  declarations and 3 constant literals, nothing executed at load). No other row may be
  split without the same argument. A stdout diff is the proof (criterion 1), not a
  reading of the diff.
- **P2 — a binding crossing a module boundary becomes a named export at its existing
  construction site.** Construction is not hoisted into a shared "repos" module and not
  duplicated: `repo` is still built where `globMatch` builds it today, and
  `selection-and-traversal.mjs` exports it. Rebuilding a fixture in a second module
  would double a real `git` repository's setup cost and is forbidden.
- **P3 — no sibling probe file is created.** Every new module lives under
  `scripts/probe-git-log/`, because `probe-release-metadata.mjs`'s wiring check treats
  any `scripts/probe-*.mjs` as a probe ci.yml must invoke (criterion 3).
- **P4 — commit 1 edits no line it moves**, with one mechanically forced exception.
  Its diff consists of moved lines, `import`/`export` statements, and per-module
  docblocks. The exception is `probe-git-log.mjs:42` — `repoRoot` is
  `path.resolve(fileURLToPath(import.meta.url), "..", "..")`, relative to the file's
  own location, and gains a third `".."` in `harness.mjs`; a path derived from
  `import.meta.url` cannot survive a move unchanged. It is the only such line:
  `createRequire(import.meta.url)` at `:113` and `:3504` resolves an absolute path and
  a node builtin respectively, neither of which depends on the caller's directory.
  Each of the eight files also gains one new file docblock naming what it holds — that
  is the "one docblock per module" commit 1 describes, and it is new prose in every
  file, including the three whose range starts on executable code and inherits nothing
  (`harness.mjs`, `selection-and-traversal.mjs`, `caps-and-windows.mjs`). Two of those
  docblocks say something a reader could act on rather than merely locating content:
  `fixtures.mjs`'s, that a builder's "checks below" now means the check modules that
  import it, and the entry's, which must carry **both** sentences §Why commits it to —
  that the import list is the execution order, and that the retained docblock's rules,
  the fixture-date window-boundary requirement above all, govern the modules it imports
  rather than the file they are written in. That second sentence is the mitigation the
  stale-positional-comment disposition rests on, so commit 1 is not done without it. No
  other edit belongs to commit 1.

- allowed-surface:
  - `scripts/probe-git-log.mjs` — reduced to the entry point (docblock, layout note, imports, teardown)
  - `scripts/probe-git-log/` — new directory holding the modules in the table above
  - `src/core/git-log.ts` — commit 3 only: the `F1` pointer comment at `:1090`, no code
  - `scripts/probe-transform-preservation.mjs` — commit 3 only: the polyfill pointer
    comment at `:54`, no code
- refactor-scope:
  - `scripts/probe-git-log.mjs` in full — every line may move to a new file under
    `scripts/probe-git-log/`, and the `import`/`export` statements the split forces may
    be added. Line content is otherwise preserved verbatim (P4's one exception aside);
    behavioral equivalence is criteria 1 and 2 together.

**Out-of-repo follow-up (criterion 5, not part of the diff)**: the profile's
`knowledge/review-scope.md` `## test-strategy` states the probe idiom as "**one
self-contained script per subject**: an 8-line `check(name, fn)` harness … copied
verbatim into each file (**no shared helper module** — that duplication is deliberate
and predates this declaration)". Both emphasized halves are about the *cross-subject*
boundary — each subject's probe
stands alone and keeps its own copy of the harness — and neither is weakened here: the
other five probes are untouched, `harness.mjs` is shared only inside the git-log probe,
and `ls scripts/probe-*.mjs` still returns one entry per subject (criterion 3). The
sentence never says which scope it means, so it gets a clause naming it, in its own
home.
