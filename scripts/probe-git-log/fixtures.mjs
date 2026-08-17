/**
 * Every fixture repository the checks run against, one builder per shape.
 *
 * A builder creates a real git repository under the shared tmp dir and returns
 * its path; none of them assert anything, and none of them call another
 * builder. The five marker-spoofing fixtures are the exception and live beside
 * their own checks in marker-spoofing.mjs, since nothing else uses them.
 *
 * A docblock here that speaks of the checks "below" means the check modules
 * that import the builder — they ran below it while this was one file, and they
 * still run after it, but they are no longer on the same page.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { at, makeGit, tmp } from "./harness.mjs";

/**
 * The contract's fixture: a base commit, a --no-ff-merged branch, a
 * never-merged branch, a squash-merged branch, a rebased-and-fast-forwarded
 * branch, an octopus merge, and a direct commit — plus the three bare branches
 * the globMatch cases below match against.
 *
 * Every branch touches its own files, so no merge here can conflict. Landings
 * are built in committer-date order (2024-07-10 .. 2024-07-14), so the
 * first-parent walk's order and their dates agree, as in a real repository.
 */
function buildFixture() {
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, msg, dates) => {
    fs.writeFileSync(path.join(repo, file), `${msg}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", msg], dates);
  };

  commit("README", "base", at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "HEAD"]).trim();
  for (const b of ["feature/2026/a/b", "probe/xy", "probe/axb"]) git(["branch", b]);

  // A1 — merged with --no-ff: a named merge landing (cd 2024-07-10) whose
  // commits were authored in June, outside the July window (A6).
  git(["checkout", "-q", "-b", "feature/merged", base]);
  commit("merged-1.txt", "merged: first", at("2024-06-01T12:00:00Z"));
  commit("merged-2.txt", "merged: second", at("2024-06-02T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/merged'", "feature/merged"],
    at("2024-07-10T12:00:00Z")
  );

  // A3 — squash-merged. The subject deliberately does not name the branch,
  // which is what GitHub and GitLab write by default.
  git(["checkout", "-q", "-b", "feature/squashed", base]);
  commit("squashed-1.txt", "squashed: alpha", at("2024-06-10T12:00:00Z"));
  commit("squashed-2.txt", "squashed: beta", at("2024-06-11T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(["merge", "--squash", "feature/squashed"]);
  git(["commit", "-q", "-m", "Add the squashed feature (#42)"], at("2024-07-11T12:00:00Z"));

  // A8 — branched off base, so rebasing onto the advanced main really rewrites
  // both commits; GIT_COMMITTER_DATE lands them in the window, author dates
  // survive the rewrite. Then main fast-forwards onto it.
  git(["checkout", "-q", "-b", "feature/rebased", base]);
  commit("rebased-1.txt", "rebased: one", at("2024-06-20T12:00:00Z"));
  commit("rebased-2.txt", "rebased: two", at("2024-06-21T12:00:00Z"));
  git(["rebase", "-q", "main"], { GIT_COMMITTER_DATE: "2024-07-12T12:00:00Z" });
  git(["checkout", "-q", "main"]);
  git(["merge", "-q", "--ff-only", "feature/rebased"]);

  // A7 — octopus. The subject matches none of parseMergeBranchName's formats,
  // so this landing is labelled `merge: <subject>`.
  git(["checkout", "-q", "-b", "feature/oct1", "main"]);
  commit("oct1.txt", "oct1: work", at("2024-06-25T12:00:00Z"));
  git(["checkout", "-q", "-b", "feature/oct2", "main"]);
  commit("oct2.txt", "oct2: work", at("2024-06-26T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    [
      "merge",
      "--no-ff",
      "-m",
      "Merge branches 'feature/oct1' and 'feature/oct2'",
      "feature/oct1",
      "feature/oct2",
    ],
    at("2024-07-13T12:00:00Z")
  );

  // A4/A6 — a direct commit whose two dates differ: it lands 2024-07-14
  // (committer, what the window filters on and the header shows) but was
  // authored 2024-06-15 (what the commit line renders).
  commit("direct.txt", "direct work on main", at("2024-06-15T12:00:00Z", "2024-07-14T12:00:00Z"));

  // A2 — never merged, branched off the finished main.
  git(["checkout", "-q", "-b", "feature/never", "main"]);
  commit("never-1.txt", "never: work in progress", at("2024-07-05T12:00:00Z"));
  git(["checkout", "-q", "main"]);

  return repo;
}

/**
 * A branch that exists only as a remote-tracking ref, with no same-named
 * local branch: enumerateBranches strips the "origin/" prefix for `display`
 * but keeps it in `ref` (git-log.ts:307-312) — the one shape where
 * selectBranches's two fields actually diverge. Every branch buildFixture()
 * and the other fixtures below create is local-only, so display === ref
 * there and no existing check can tell a correct `test(b.display) ||
 * test(b.ref)` apart from a regression that drops one side or tests the
 * wrong field. update-ref plants the ref directly; no real remote is needed
 * for for-each-ref to see it.
 */
function buildRemoteTrackingFixture() {
  const repo = path.join(tmp, "remote-tracking");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const base = git(["rev-parse", "main"]).trim();
  // The subject deliberately does not contain the branch name: path 1 must not
  // fire, or the branch would be confirmed as a *named landing* and these
  // checks would assert the old label instead of the new one.
  const tip = git(
    ["commit-tree", tree, "-p", base, "-m", "work on the remote-only feature"],
    at("2024-01-02T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/remotes/origin/feature/remote-only", tip]);

  // Land the same work on main under a different hash — a squash, in other
  // words. Without a landing to resolve against, no path confirms the branch,
  // and every check below would assert a header that never appears.
  fs.writeFileSync(path.join(repo, "README"), "base\nremote-only feature\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "work on the remote-only feature"], at("2024-01-03T12:00:00Z"));

  return repo;
}

/**
 * A11's fixture: more than MAX_BRANCHES named merge landings, oldest first, so
 * feature/n1's landing sits well outside the 50 most recent. Built with
 * commit-tree rather than checkout/merge — same shape, a fraction of the git
 * invocations.
 */
function buildManyLandingsFixture(count) {
  const repo = path.join(tmp, "many");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "many\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  let head = git(["rev-parse", "main"]).trim();
  for (let i = 1; i <= count; i++) {
    const env = at(new Date(Date.UTC(2024, 4, 1, 12) + i * 86_400_000).toISOString());
    const side = git(["commit-tree", tree, "-p", head, "-m", `work on feature/n${i}`], env).trim();
    const merge = git(
      ["commit-tree", tree, "-p", head, "-p", side, "-m", `Merge branch 'feature/n${i}'`],
      env
    ).trim();
    git(["branch", `feature/n${i}`, side]);
    head = merge;
  }
  git(["update-ref", "refs/heads/main", head]);
  git(["reset", "-q", "--hard", "main"]);
  return repo;
}

/**
 * More than MAX_BRANCHES branches whose work is squash-landed on main, plus
 * main's own tip bumped to the most recent committer date of all — the shape
 * that catches the eligible-set filter regression. If `base` is excluded only
 * inside the per-branch loop rather than before the cap slice, a selection
 * that also matches the base ref (a bare `*` glob does) lets the base waste a
 * scan slot ahead of the real branches, evicting one more than the cap alone
 * would. Built with commit-tree, same as buildManyLandingsFixture.
 *
 * Every branch is confirmable by path 2 — its subject appears verbatim in
 * exactly one landing — which is what gives the cap something to truncate.
 */
function buildManyConfirmableBranchesFixture(count) {
  const repo = path.join(tmp, "manyConfirmable");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "main"]).trim();
  const tree = git(["rev-parse", "main^{tree}"]).trim();

  for (let i = 1; i <= count; i++) {
    const env = at(new Date(Date.UTC(2024, 0, 1, 12) + i * 86_400_000).toISOString());
    // The subject names no branch, so path 1 cannot fire and every branch is
    // confirmed the same way — by path 2, against the landings planted below.
    // `unit 1 work` is not a substring of `unit 10 work`, so no two branches
    // collide on the exactly-one bound.
    const tip = git(["commit-tree", tree, "-p", base, "-m", `unit ${i} work`], env).trim();
    git(["branch", `feature/u${i}`, tip]);
  }

  // Land each branch's work on main under a different hash — squashes. Without
  // these the branches are unconfirmable, nothing is emitted, and the cap has
  // nothing to evict, which is what this fixture exists to observe.
  for (let i = 1; i <= count; i++) {
    const env = at(new Date(Date.UTC(2024, 6, 1, 12) + i * 3_600_000).toISOString());
    fs.writeFileSync(path.join(repo, `u${i}.txt`), `${i}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", `unit ${i} work`], env);
  }

  // main's tip lands after every branch's commit, so main out-ranks all of
  // them by committer date — the worst case for the regression.
  //
  // Its subject must not name the base. `later main work` did, and `main` is a
  // whole token there, so path 1 named the base's own landing and namedAlready
  // then took the base out of the eligible set before the base-exclusion
  // filter — or the cap slice — was ever consulted. Every check below then
  // held for a reason that had nothing to do with what they pin.
  const mainEnv = at(new Date(Date.UTC(2024, 0, 1, 12) + (count + 1) * 86_400_000).toISOString());
  fs.writeFileSync(path.join(repo, "later.txt"), "later\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "later work on the trunk"], mainEnv);

  return repo;
}

/**
 * An ordinary clone: `origin/HEAD` points at `origin/main` and a local `main`
 * sits on the same commit. `resolveBaseRef` returns the remote form while
 * `enumerateBranches` dedups by display and prefers the local ref, so the base
 * appears in the branch list as `{display:"main", ref:"main"}` — a raw
 * `ref !== base` comparison misses it and path 3 then confirms the base
 * branch as its own landed work. Every other fixture here uses a local base,
 * which is why nothing caught it.
 *
 * Its second landing names the base in both its forms, so path 1 is reachable
 * here too: the base exclusion has to hold where no git is queried at all.
 */
function buildRemoteBaseFixture() {
  const repo = path.join(tmp, "remote-base");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base work"], at("2024-09-01T12:00:00Z"));
  // One landing naming the base in both its forms — `main` after a space at
  // the subject's end, `origin/main` between spaces in the body — each a whole
  // token in exactly one landing, so neither the token bound nor the
  // exactly-one bound rejects it. Only the base exclusion keeps path 1 from
  // naming the base's own landing after the base. Planted before origin/main
  // is written, so it sits on the base's first-parent history.
  fs.writeFileSync(path.join(repo, "hotfix.txt"), "hotfix\n");
  git(["add", "-A"]);
  git(
    ["commit", "-q", "-m", "hotfix applied straight to main\n\ncherry-picked from origin/main by hand"],
    at("2024-09-02T12:00:00Z")
  );
  const head = git(["rev-parse", "main"]).trim();
  git(["update-ref", "refs/remotes/origin/main", head]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  return repo;
}

/**
 * Panel-found regression (git-log-named-window-invariance, full-panel
 * correctness review): a merge subject can *parse* to the base's own name —
 * `Merge pull request #N from someuser/main` is an ordinary shape whenever a
 * contributor's fork also defaults to `main` — and `branches:*` selects the
 * base too. `namedSelected`'s derivation had no `namesBase` guard, unlike
 * every sibling derivation in the same function (`names`, `eligible`), so the
 * base could confirm itself by name once its naming landing took the new
 * header-only form (any window that doesn't cover this 2024 date, which the
 * 7-day glob default never does). B12 already forbids confirming the base by
 * any path; this fixture is the one shape `buildRemoteBaseFixture` (path 1,
 * message-mention only) cannot reach, because it has no merge landing at all.
 *
 * git-log-base-named-merge grew it into the two arms E1-E7 need. The default
 * arm carries **two** base-naming merges, because one cannot serve both jobs:
 * once a base-naming merge yields no name it becomes path-1-assignable, so the
 * merge whose body names `feature/x` (E4) renders under that name, and the
 * merge E7 needs to see as a nameless `merge:` section has to be a different
 * one — hence a bodyless first merge and a second that names the branch.
 *
 * `{ unpulledRemote: true }` builds the other arm: a base that resolves to
 * `origin/main` whose tip is **ahead of the local `main`**. That one shape
 * carries both of E3's spellings (a merge parsed as `main`, the base's display
 * form, and one parsed as `origin/main`, its ref form) and E6's precondition —
 * `enumerateBranches` dedups by display keeping the newer tip, so the base is
 * listed as `origin/main` and a memo carrying that spelling selects it, which
 * is the only way a pasted candidate reaches the base at all (`main` has no
 * slash, so `branchCandidates` never yields it).
 */
function buildBaseNamedMergeFixture({ unpulledRemote = false } = {}) {
  const repo = path.join(tmp, unpulledRemote ? "base-named-merge-remote" : "base-named-merge");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "main"]).trim();
  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const side = git(
    ["commit-tree", tree, "-p", base, "-m", "some fork work"],
    at("2024-03-01T11:00:00Z")
  ).trim();
  const merge = git(
    ["commit-tree", tree, "-p", base, "-p", side, "-m", "Merge pull request #5 from someuser/main"],
    at("2024-03-01T12:00:00Z")
  ).trim();

  if (unpulledRemote) {
    // The base's *ref* spelling: `Merge branch '<x>'` captures the quoted name
    // whole, so this parses to `origin/main` where the merge above parses to
    // `main`. Both name the base here, by different halves of namesBase.
    const refSide = git(
      ["commit-tree", tree, "-p", merge, "-m", "more fork work"],
      at("2024-05-01T11:00:00Z")
    ).trim();
    const refMerge = git(
      ["commit-tree", tree, "-p", merge, "-p", refSide, "-m", "Merge branch 'origin/main'"],
      at("2024-05-01T12:00:00Z")
    ).trim();
    git(["update-ref", "refs/remotes/origin/main", refMerge]);
    git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    // The local branch stays at the first commit: this clone has not fetched
    // either merge, which is what puts the remote tip ahead of it.
    return repo;
  }

  // A second base-naming merge, whose body names a branch the selection can
  // reach. Its side commit is `feature/x`'s tip, so a `feature/*` glob has
  // something to select that is not the base.
  const namingSide = git(
    ["commit-tree", tree, "-p", merge, "-m", "second fork work"],
    at("2024-04-01T11:00:00Z")
  ).trim();
  const namingMerge = git(
    [
      "commit-tree",
      tree,
      "-p",
      merge,
      "-p",
      namingSide,
      "-m",
      "Merge pull request #6 from someuser/main\n\nWraps up feature/x",
    ],
    at("2024-04-01T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/heads/feature/x", namingSide]);
  git(["update-ref", "refs/heads/main", namingMerge]);
  git(["reset", "-q", "--hard", "main"]);
  return repo;
}

/**
 * The cap half of "nameless in full". §Spec says a landing whose only name was
 * the base's takes the nameless **cap priority** as well as the nameless
 * window; E1-E7 measure only the window. `selected` places every matched named
 * landing ahead of every nameless one so the cap cannot evict a selected
 * branch's landing (A16) — and under `branches:*`, which selects the base too,
 * a base-naming merge used to sit inside that protected arm. It now sits
 * behind all of it, which is a third way its membership moves.
 *
 * `namedCount` is the only variable between the two repositories this builds,
 * so one header constant serves both and nothing but the size of the crowd
 * differs. The base-naming merge is dated past every named merge at the
 * current cap, which makes it the newest landing in either repository — the
 * sharpest form of the claim, though not what the eviction turns on: arm 2 is
 * emptied whenever arm 1 alone fills the cap, whatever the dates. Built with
 * commit-tree, same as buildManyLandingsFixture.
 */
function buildBaseNamedMergeCrowdedFixture(namedCount) {
  const repo = path.join(tmp, `base-named-merge-crowded-${namedCount}`);
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  let head = git(["rev-parse", "main"]).trim();
  for (let i = 1; i <= namedCount; i++) {
    const env = at(new Date(Date.UTC(2024, 4, 1, 12) + i * 86_400_000).toISOString());
    const side = git(["commit-tree", tree, "-p", head, "-m", `work on feature/n${i}`], env).trim();
    head = git(
      ["commit-tree", tree, "-p", head, "-p", side, "-m", `Merge branch 'feature/n${i}'`],
      env
    ).trim();
    git(["branch", `feature/n${i}`, side]);
  }

  // Newest of all, and the only landing here `landingName` leaves nameless.
  const forkSide = git(
    ["commit-tree", tree, "-p", head, "-m", "some fork work"],
    at("2024-09-01T11:00:00Z")
  ).trim();
  const forkMerge = git(
    [
      "commit-tree",
      tree,
      "-p",
      head,
      "-p",
      forkSide,
      "-m",
      "Merge pull request #5 from someuser/main",
    ],
    at("2024-09-01T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/heads/main", forkMerge]);
  git(["reset", "-q", "--hard", "main"]);
  return repo;
}

/**
 * docs/specs/git-log-base-guard-pinning.md, item 15 — the one input shape that
 * reaches loadGitLog's path-1 write guard. The base resolves to `origin/main`,
 * and a *third* remote's `upstream/main` carries the newest tip in the
 * repository: enumerateBranches sorts by committer date and dedups by display,
 * so that ref claims the display name `main` and drops `origin/main` from the
 * list. A memo pasting `upstream/main` then clears `namesBase` — it is neither
 * of the base's two spellings — and comes back out of `displayOf` as `main`,
 * the base's own display name. Nothing downstream of the guard catches it.
 *
 * The landing has to sit inside `origin/main` and not merely inside the local
 * `main`: the first-parent walk runs on `base.ref`, so a landing outside it is
 * not a landing at all.
 */
function buildDisplayCollisionFixture() {
  const repo = path.join(tmp, "display-collision");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-08-01T12:00:00Z"));
  // Squash-shaped — single parent, and its message names where it came from,
  // which is the only evidence path 1 ever has. `upstream/main` is a whole
  // ref-charset token, so branchCandidates yields it from a memo and
  // mentionsName matches it here.
  //
  // Exactly one landing in this repository may mention `upstream/main`. The
  // predicate's bound is exactly-one (landingsNaming maps a name to null on a
  // second match), so a second mention makes path 1 skip the landing entirely
  // — and F1 then passes every assertion without ever reaching the guard it
  // exists to hold. Do not add one.
  fs.writeFileSync(path.join(repo, "hotfix.txt"), "hotfix\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "hotfix from upstream/main applied"], at("2024-09-01T12:00:00Z"));
  const head = git(["rev-parse", "main"]).trim();
  git(["update-ref", "refs/remotes/origin/main", head]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  // Newest ref of all, so for-each-ref lists it first and the dedup keeps its
  // display form. Built with commit-tree so the checked-out branch stays put.
  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const upstream = git(
    ["commit-tree", tree, "-p", head, "-m", "upstream moved on"],
    at("2024-10-01T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/remotes/upstream/main", upstream]);
  return repo;
}

/**
 * docs/specs/git-log-base-guard-pinning.md, item 18 — a `branches:` glob
 * spelled in the base's *ref* form in a repository where that ref lost the
 * display dedup. The base resolves to `origin/main`; the local `main` is one
 * commit ahead and newest of all, so enumerateBranches keeps
 * {display:"main", ref:"main"} and `branches:origin/main` selects nothing at
 * all, which is what gets the glob gate reached.
 *
 * On the base, in commit order: the root; a two-parent merge whose subject
 * parses to `origin/main` and which landingName therefore leaves nameless — the
 * landing the glob matched and could not name; a direct commit, so a window can
 * cover a landing of the base's own without reaching back to the root; and an
 * ordinary `feature/x` merge, which `branches:origin/main` must **not** select
 * and which is what separates a gate that keeps the repository a selection from
 * one that drops it to the no-selection path.
 */
function buildBaseRefGlobFixture() {
  const repo = path.join(tmp, "base-ref-glob");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const root = git(["rev-parse", "main"]).trim();
  const tree = git(["rev-parse", "main^{tree}"]).trim();
  // `Merge branch '<x>'` captures the quoted name whole, so this parses to the
  // base's ref spelling rather than its display one.
  const baseSide = git(
    ["commit-tree", tree, "-p", root, "-m", "work from the mirror"],
    at("2024-03-01T11:00:00Z")
  ).trim();
  const baseMerge = git(
    ["commit-tree", tree, "-p", root, "-p", baseSide, "-m", "Merge branch 'origin/main'"],
    at("2024-03-01T12:00:00Z")
  ).trim();
  const direct = git(
    ["commit-tree", tree, "-p", baseMerge, "-m", "hotfix straight on the base"],
    at("2024-04-01T12:00:00Z")
  ).trim();
  const featureSide = git(
    ["commit-tree", tree, "-p", direct, "-m", "work on the feature"],
    at("2024-05-01T11:00:00Z")
  ).trim();
  const featureMerge = git(
    ["commit-tree", tree, "-p", direct, "-p", featureSide, "-m", "Merge branch 'feature/x'"],
    at("2024-05-01T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/remotes/origin/main", featureMerge]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  git(["update-ref", "refs/heads/feature/x", featureSide]);
  const ahead = git(
    ["commit-tree", tree, "-p", featureMerge, "-m", "local work not pushed"],
    at("2024-06-01T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/heads/main", ahead]);
  git(["reset", "-q", "--hard", "main"]);
  return repo;
}

/**
 * git-log-landed-confirmation's fixture. Every landing here is single-parent —
 * a squash/rebase repository, the shape the landed predicate exists for, where
 * no landing carries a branch name of its own. It plants one instance of each
 * evidence shape the three paths must separate:
 *
 *   feature/named     landed, ref DELETED, the landing's body names it   → path 1
 *   feature/globnamed landed, ref KEPT, the landing's body names it      → path 1 only
 *   feature/resolved  landed, ref kept, subject survives the squash      → path 2
 *   feature/ancestor  landed by fast-forward, no base-unique commits     → path 3
 *   feature/rewritten landed, but the squash rewrote its subjects        → hidden
 *   feature/generic   unlanded, and its subject recurs across landings   → hidden
 *   feature/reverted  landed, reverted, reapplied                        → path 2
 *   feature/ghost     named only inside a `Revert "..."` subject         → hidden
 *
 * feature/globnamed is deliberately confirmable by path 2 as well — its landing
 * kept the branch subject verbatim — so "tried 1 → 2 → 3 and stop at the first
 * success" has an observable: a broken exclusivity emits two sections for it,
 * one per path. It is also the only ref-bearing path-1 branch here, which is
 * what lets `branches:<glob>` reach path 1 at all (a glob selects refs, and the
 * one name with no ref, feature/named, is unreachable that way).
 */
function buildConfirmationFixture() {
  const repo = path.join(tmp, "confirmation");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, message, env) => {
    fs.writeFileSync(path.join(repo, file), `${file}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", message], env);
  };
  const day = (n) => at(`2024-08-${String(n).padStart(2, "0")}T12:00:00Z`);

  commit("README", "base", day(1));
  const base = git(["rev-parse", "main"]).trim();
  const tree = git(["rev-parse", "main^{tree}"]).trim();

  // Branch refs, all forked from the root. Their commits never reach main by
  // hash — only their patches or their names do, which is the whole point.
  const branchTip = (name, subject, n) => {
    const tip = git(["commit-tree", tree, "-p", base, "-m", subject], day(n)).trim();
    git(["branch", name, tip]);
    return tip;
  };
  branchTip("feature/resolved", "add the resolved thing", 2);
  branchTip("feature/rewritten", "add the first half", 3);
  branchTip("feature/generic", "bug fixed", 4);
  branchTip("feature/reverted", "add the reverted thing", 5);
  // Token-boundary pair: `feature/tok` is a prefix of `feature/token-longer`,
  // and only the latter is ever mentioned in a landing.
  branchTip("feature/tok", "tok: work that never landed", 6);
  branchTip("feature/token-longer", "token-longer: work that never landed", 7);
  // The token bound's *other* side. `feature/pre` is named only where a ref
  // character sits immediately before the name (inside a longer path), and
  // `feature/scan` is named twice in one message — the first occurrence glued
  // to a path, the second free-standing.
  branchTip("feature/pre", "pre: work that never landed", 6);
  branchTip("feature/scan", "scan: work that never landed", 7);
  // Same subject as its landing below, so path 2 would confirm it too — which
  // is the point: only path 1 running first keeps it to one section.
  branchTip("feature/globnamed", "Add the glob-named feature (#13)", 6);
  // Two base-unique commits, the newer one carrying no subject at all. The
  // older one's subject lands below, so a predicate that drops empty subjects
  // reaches an unresolved count of zero on the strength of the one commit
  // nothing can account for. No other fixture here has a subject-less commit.
  {
    const half = git(["commit-tree", tree, "-p", base, "-m", "add the accounted-for half"], day(6)).trim();
    // No -m at all: makeGit runs git with stdin ignored, so the message is empty.
    const blank = git(["commit-tree", tree, "-p", half], day(7)).trim();
    git(["branch", "feature/emptysubject", blank]);
  }

  // Landings on main. Single-parent throughout.
  commit("named.txt", "Add the named feature (#7)\n\nSquash-merge-from: feature/named", day(10));
  commit("resolved.txt", "add the resolved thing", day(11));
  // The squash rewrote two branch subjects into one combined subject, so no
  // branch subject survives verbatim — feature/rewritten stays unconfirmable.
  // Not a superstring of the branch subject — a squash that *rewrote* it. If
  // the landing merely appended, the branch subject would still be a substring
  // and path 2 would resolve it, which is not the shape this pins.
  commit("rewritten.txt", "add both halves of the thing", day(12));
  // Both mention the same file path, which `branchCandidates` accepts as a
  // candidate name — the shape path 1's exactly-one bound exists to reject.
  commit("generic1.txt", "bug fixed\n\ntouches src/core/thing.ts", day(13));
  commit("generic2.txt", "bug fixed\n\ntouches src/core/thing.ts again", day(14));
  const reverted = (() => {
    commit("reverted.txt", "add the reverted thing", day(15));
    const h = git(["rev-parse", "main"]).trim();
    git(["revert", "--no-edit", h], day(16));
    const r = git(["rev-parse", "main"]).trim();
    git(["revert", "--no-edit", r], day(17));
    // git names the second revert `Reapply "..."` on modern git; normalize so
    // the fixture pins the label this predicate excludes, not git's version.
    git(["commit", "-q", "--amend", "-m", `Reapply "add the reverted thing"`], day(17));
    return h;
  })();
  void reverted;

  // A ref-bearing branch its landing's body names: path 1 confirms it before
  // path 2 ever runs, and a glob can reach it because a ref exists.
  commit(
    "globnamed.txt",
    "Add the glob-named feature (#13)\n\nSquash-merge-from: feature/globnamed",
    day(18)
  );
  // B3's second half. The only landing carrying this name is a revert, and the
  // exclusion takes it out of the candidate set — so the name confirms nothing.
  // Without the exclusion this is a single unambiguous match and path 1 would
  // hand feature/ghost a landed section, which is exactly the false positive
  // the revert rule exists to stop.
  commit("ghost.txt", `Revert "add the ghost thing for feature/ghost"`, day(19));

  commit("tokens.txt", "wrap up the work from feature/token-longer", day(18));
  // Names feature/pre only with a ref character immediately *before* it — the
  // name sits inside a longer path, the accidental hit the bound exists to
  // reject. Its trailing side is clean, so only the leading side can reject it.
  commit("pre.txt", "sync docs/feature/pre into the tree", day(20));
  // Two occurrences of feature/scan in one message: the first glued to a path,
  // the second free-standing. A scan that stops at the first occurrence it
  // rejects never reaches the one that confirms.
  commit("scan.txt", "tidy docs/feature/scan, then land feature/scan", day(21));
  // Accounts for feature/emptysubject's *other* commit, and only that one.
  commit("half.txt", "add the accounted-for half", day(22));

  // Fast-forwarded branch: main is moved onto it, so it is an ancestor with no
  // base-unique commits — invisible to both text paths.
  git(["branch", "feature/ancestor", "main"]);

  return repo;
}

/** Literal tabs, spelled out so no reformatting can quietly turn them to spaces. */
const TABBED_MERGE_SUBJECT = "combine\tthe two streams";
const TABBED_SQUASH_SUBJECT = "add\tthe tabbed thing (#12)";

/**
 * `enumerateLandings` now reads `%b` alongside `%s` — the landed predicate
 * searches subject *and* body — and that forced its record format off
 * newline/tab delimiters onto `%x00` records with `%x01` fields. Nothing in the
 * fixtures above can tell the new parser from a regression back to the old
 * shape: every subject there is tab-free and every body is a single line.
 *
 * Two shapes that do:
 *   - a squash landing whose body runs several blank-line-separated paragraphs
 *     before naming its branch. A newline-delimited record stops at the first
 *     blank line, so the name is unreachable and path 1 silently declines.
 *   - a merge landing whose subject carries a literal tab and matches none of
 *     parseMergeBranchName's formats, so the raw subject reaches the
 *     `merge: <subject>` header. Tab-delimited fields truncate it at the tab.
 */
function buildMessageParsingFixture() {
  const repo = path.join(tmp, "parsing");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-09-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const side = git(["commit-tree", tree, "-p", "main", "-m", "side work"], at("2024-09-02T12:00:00Z")).trim();
  const merge = git(
    ["commit-tree", tree, "-p", "main", "-p", side, "-m", TABBED_MERGE_SUBJECT],
    at("2024-09-02T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/heads/main", merge]);
  git(["reset", "-q", "--hard", "main"]);

  fs.writeFileSync(path.join(repo, "multiline.txt"), "x\n");
  git(["add", "-A"]);
  git(
    [
      "commit",
      "-q",
      "-m",
      [TABBED_SQUASH_SUBJECT, "", "first paragraph", "", "second paragraph", "", "Squash-merge-from: feature/multiline"].join("\n"),
    ],
    at("2024-09-03T12:00:00Z")
  );
  return repo;
}

/**
 * B16's second half. `merge-base --is-ancestor` answers with exit 1 and errors
 * with 128, and the predicate must keep treating 128 as the git.failed the
 * error contract has always raised. A ref pointing at a tree is the reachable
 * shape: `update-ref` refuses to write a non-commit, so the ref file is written
 * directly, and `for-each-ref` then hands the predicate a name every git
 * revision walk rejects with 128.
 *
 * No selection is needed to read this repository — only the predicate ever
 * touches a branch ref — so the check below also pins that the failure comes
 * from the predicate and not from the landing walk.
 */
function buildBrokenRefFixture() {
  const repo = path.join(tmp, "brokenRef");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const tree = git(["rev-parse", "main^{tree}"]).trim();
  fs.mkdirSync(path.join(repo, ".git/refs/heads/feature"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".git/refs/heads/feature/broken"), `${tree}\n`);
  return repo;
}

/**
 * A ref whose name begins with a dash. `git branch -- -evil/x` refuses the
 * name outright, so the ref file is planted directly, the same way
 * buildBrokenRefFixture plants its broken one; `for-each-ref` then hands the
 * predicate a branch name git's own option parser will read as a switch.
 *
 * The ref points at the base's own commit, so the base-unique query comes back
 * empty and the predicate reaches path 3 — `merge-base --is-ancestor` is the
 * only call site where the ref lands in *option* position. Without `--` before
 * the revisions git answers "unknown switch" with exit 129, which is neither 0
 * nor 1 and therefore fails the whole transform for every repository in the
 * callout. Measured (git 2.50.1): 129 without, 0 with.
 */
function buildDashRefFixture() {
  const repo = path.join(tmp, "dashRef");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const head = git(["rev-parse", "main"]).trim();
  fs.mkdirSync(path.join(repo, ".git/refs/heads/-evil"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".git/refs/heads/-evil/x"), `${head}\n`);
  return repo;
}

/**
 * B11's shape: one landing, and both spellings of the branch that produced it
 * pasted in the same memo — the case "one landing carries at most one name"
 * exists for. The landing's body names the branch in its ref form, so both
 * `feature/dual` and `origin/feature/dual` match it and either could claim it.
 * The ref is remote-tracking-only, so display and ref genuinely differ.
 */
function buildDualNameFixture() {
  const repo = path.join(tmp, "dual");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const base = git(["rev-parse", "main"]).trim();
  const tip = git(
    ["commit-tree", tree, "-p", base, "-m", "work on the dual feature"],
    at("2024-01-02T12:00:00Z")
  ).trim();
  git(["update-ref", "refs/remotes/origin/feature/dual", tip]);

  fs.writeFileSync(path.join(repo, "dual.txt"), "x\n");
  git(["add", "-A"]);
  git(
    ["commit", "-q", "-m", "Add the dual feature (#11)\n\nSquash-merge-from: origin/feature/dual"],
    at("2024-01-03T12:00:00Z")
  );
  return repo;
}

/**
 * git-log-named-window-invariance's C4 fixture: a branch merged normally
 * (so its landing is merge-parsed as the branch's *display* form) and then
 * converted to remote-tracking-only — display "feature/remoteonly", ref
 * "origin/feature/remoteonly" — mirroring an ordinary clone where the source
 * branch was deleted locally after fetch. Neither existing "two spellings"
 * fixture serves this: buildRemoteTrackingFixture's landing deliberately
 * names no branch (path 1 must not fire there), and buildDualNameFixture's
 * landing is a single-parent squash, so neither carries a merge-parsed name
 * to fold.
 */
function buildRemoteTrackingMergedFixture() {
  const repo = path.join(tmp, "remote-tracking-merged");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  git(["checkout", "-q", "-b", "feature/remoteonly"]);
  fs.writeFileSync(path.join(repo, "w.txt"), "x\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "remoteonly: the work"], at("2024-02-01T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/remoteonly'", "feature/remoteonly"],
    at("2024-02-02T12:00:00Z")
  );

  const tip = git(["rev-parse", "feature/remoteonly"]).trim();
  git(["update-ref", "refs/remotes/origin/feature/remoteonly", tip]);
  git(["branch", "-q", "-D", "feature/remoteonly"]);
  return repo;
}

/**
 * git-log-named-window-invariance's C2 fixture: `verify-path1only.mjs`'s
 * shape, kept in the probe rather than only as a throwaway. A live ref that
 * is *not* an ancestor of the base and whose only base-unique subject occurs
 * in no landing — paths 2 and 3 both fail — plus a landing whose message
 * merely mentions the branch by name, which is path 1's entire premise. This
 * is the fixture the rejected "fall through to paths 2/3" fix would still
 * have left silent.
 */
function buildPathOneOnlyFixture() {
  const repo = path.join(tmp, "path1only");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  git(["checkout", "-q", "-b", "feature/p1"]);
  fs.writeFileSync(path.join(repo, "w.txt"), "2\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "p1: work whose subject landed nowhere"], at("2024-02-01T12:00:00Z"));
  git(["checkout", "-q", "main"]);

  fs.writeFileSync(path.join(repo, "l.txt"), "3\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "wrap up the work from feature/p1"], at("2024-07-10T12:00:00Z"));

  return repo;
}

/**
 * A16's fixture: one named merge landing, old, followed by more
 * than MAX_BRANCHES nameless direct commits (newer). Pasting the merge's
 * branch name sets since to null (the window rule), so `enumerateLandings`
 * returns every nameless commit too — nameless landings are never filtered
 * out by name (§Selection). Before the fix, `loadLandingSections` sliced
 * newest-first without prioritizing the matched landing, so the nameless
 * commits — all newer — filled every cap slot and evicted the one landing
 * the user actually selected.
 */
function buildSelectedLandingCrowdedByNamelessFixture(directCount) {
  const repo = path.join(tmp, "crowded");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "crowded\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const base = git(["rev-parse", "main"]).trim();
  const sideEnv = at("2024-01-05T12:00:00Z");
  const side = git(["commit-tree", tree, "-p", base, "-m", "work on feature/selected"], sideEnv).trim();
  const merge = git(
    ["commit-tree", tree, "-p", base, "-p", side, "-m", "Merge branch 'feature/selected'"],
    sideEnv
  ).trim();
  git(["branch", "feature/selected", side]);
  git(["update-ref", "refs/heads/main", merge]);
  git(["reset", "-q", "--hard", "main"]);

  // Every direct commit lands after the merge, so a naive newest-first cap
  // fills entirely with these before the merge landing gets a slot.
  for (let i = 1; i <= directCount; i++) {
    const env = at(new Date(Date.UTC(2024, 1, 1, 12) + i * 86_400_000).toISOString());
    fs.writeFileSync(path.join(repo, `d${i}.txt`), `${i}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", `direct work ${i}`], env);
  }
  return repo;
}

/**
 * A12's fixture: one landing old enough that only an unbounded walk reaches it,
 * and one recent enough that the 7-day default does.
 *
 * The recent commit is dated relative to now — the one place in this probe
 * where that is right rather than drift. Every other fixture is fixed in 2024
 * and every other assertion passes an explicit window, which is precisely what
 * kept the default-window path unexercised and hid the bug A12 exists for. A12
 * is *about* the default window, so its fixture has to straddle that window's
 * live boundary. Nothing below asserts an absolute date: the criterion is an
 * equality between two runs taken at the same instant, which holds whatever the
 * clock says.
 */
function buildDefaultWindowFixture() {
  const repo = path.join(tmp, "window");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, msg, dates) => {
    fs.writeFileSync(path.join(repo, file), `${msg}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", msg], dates);
  };

  commit("README", "base", at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "HEAD"]).trim();

  // A13's sharp case: merged, then the source branch deleted — the ordinary
  // GitHub flow. The name now survives only on the landing, so the match test
  // has to see a landing older than the default window or it will not see it
  // at all. This is where reading narrow first is wrong, not merely slower.
  git(["checkout", "-q", "-b", "feature/deleted", base]);
  commit("deleted.txt", "deleted: work", at("2024-06-05T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/deleted'", "feature/deleted"],
    at("2024-07-09T12:00:00Z")
  );
  git(["branch", "-D", "feature/deleted"]);

  // Reachable only by an unbounded walk — the bug's tell. Branch still exists.
  git(["checkout", "-q", "-b", "feature/old", base]);
  commit("old.txt", "old: work", at("2024-06-01T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/old'", "feature/old"],
    at("2024-07-10T12:00:00Z")
  );

  // Inside the 7-day default, so the window is provably live, not just empty.
  commit("recent.txt", "recent work", at(new Date(Date.now() - 2 * 86_400_000).toISOString()));
  return repo;
}

/**
 * A14's fixture: a merge subject carrying a 100k-character branch name, which
 * `parseMergeBranchName` lifts onto the landing and the user's `branches:` glob
 * is then tested against. That is the real path the security finding named — a
 * third party's commit subject reaching the user's glob — and it is reached
 * through loadGitLog, exactly as A10's globs are. globMatch stays unexported.
 *
 * `feature/hotfix` exists so the glob matches a ref: that makes the
 * git.no-branches guard short-circuit, and the long name then meets the regex
 * at the name-filtering step rather than inside a throw.
 */
const HUGE_NAME_LENGTH = 100_000;

function buildLongSubjectFixture() {
  const repo = path.join(tmp, "redos");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, msg, dates) => {
    fs.writeFileSync(path.join(repo, file), `${msg}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", msg], dates);
  };

  commit("README", "base", at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "HEAD"]).trim();
  git(["branch", "feature/hotfix"]);

  git(["checkout", "-q", "-b", "feature/huge", base]);
  commit("huge.txt", "huge: work", at("2024-06-01T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", `Merge branch '${"a".repeat(HUGE_NAME_LENGTH)}'`, "feature/huge"],
    at("2024-07-10T12:00:00Z")
  );

  // Fixture-overhead trim (deferred-followups item 2): resolveBaseRef tries
  // origin/HEAD, then origin/main, then origin/master, then main in turn — a
  // bare local-only repo like every other fixture here fails the first three
  // and costs 4 git spawns before loadGitLog's timed work even starts.
  // Pre-seeding an origin/main tracking ref lets it resolve on the very first
  // spawn, which is overhead this timing-sensitive fixture can't afford: it
  // is unrelated to what A14 measures (the glob matcher's own performance).
  const mainTip = git(["rev-parse", "main"]).trim();
  git(["update-ref", "refs/remotes/origin/main", mainTip]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);

  return repo;
}

/**
 * git-log-base-named-merge's pre-refactor safety net (refactor-scope site 1).
 * `enumerateLandings`'s `base` parameter becomes a BranchRef, so the function
 * itself starts choosing which of the base's two forms bounds the walk — a
 * choice its single caller makes today, by passing `base.ref`.
 *
 * An unpulled clone is the one shape where the two forms disagree about
 * history: `origin/main` carries a landing the local `main` has not fetched,
 * so walking the display form silently drops it and reports less work than
 * happened. Every existing fixture that has an `origin/main` at all points it
 * at the local tip (buildRemoteBaseFixture, buildLongSubjectFixture), where
 * both forms walk identical histories and nothing can tell them apart —
 * verified by mutation: passing `base.display` instead leaves the whole suite
 * green.
 */
function buildUnpulledCloneFixture() {
  const repo = path.join(tmp, "unpulled-clone");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const localTip = git(["rev-parse", "main"]).trim();

  fs.writeFileSync(path.join(repo, "shipped.txt"), "x\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "shipped while the clone was stale"], at("2024-02-01T12:00:00Z"));
  git(["update-ref", "refs/remotes/origin/main", git(["rev-parse", "main"]).trim()]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  // Rewind the local branch only: origin/main is now one landing ahead of it.
  git(["update-ref", "refs/heads/main", localTip]);
  git(["reset", "-q", "--hard", "main"]);
  return repo;
}

/**
 * git-log-base-named-merge's pre-refactor safety net (refactor-scope sites 1
 * and 2) — the two `Landing.branch` write sites in one repository, in the two
 * shapes that make their current relationship observable:
 *
 *   - A two-parent merge parsed as `feature/first` whose body also names
 *     `feature/second`. Both are pasted, `feature/second` last, so path 1
 *     would relabel this landing the moment it stopped honouring
 *     `landing.branch === null` — the precedence rule that decides which of
 *     the two writers wins, and the one the fix puts in play (a base-naming
 *     merge becomes path-1-assignable precisely because write site 1 starts
 *     yielding null for it).
 *   - A single-parent commit whose subject still reads `Merge branch
 *     'feature/flattened'`: a `git pull` merge that a later rebase flattened
 *     keeps its subject and loses its second parent. Only enumerateLandings'
 *     parent-count test keeps that subject from being read as a name.
 *
 * Both shapes are unpinned today — verified by mutation, each slip leaves the
 * whole suite green.
 */
function buildWriteBoundaryFixture() {
  const repo = path.join(tmp, "write-boundary");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  git(["checkout", "-q", "-b", "feature/first"]);
  fs.writeFileSync(path.join(repo, "first.txt"), "x\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "first: the work"], at("2024-01-15T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    [
      "merge",
      "--no-ff",
      "-m",
      "Merge branch 'feature/first'\n\nAlso wraps up feature/second",
      "feature/first",
    ],
    at("2024-02-01T12:00:00Z")
  );

  fs.writeFileSync(path.join(repo, "flat.txt"), "x\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "Merge branch 'feature/flattened'"], at("2024-03-01T12:00:00Z"));
  return repo;
}

export { HUGE_NAME_LENGTH, TABBED_MERGE_SUBJECT, buildBaseNamedMergeCrowdedFixture, buildBaseNamedMergeFixture, buildBaseRefGlobFixture, buildBrokenRefFixture, buildConfirmationFixture, buildDashRefFixture, buildDefaultWindowFixture, buildDisplayCollisionFixture, buildDualNameFixture, buildFixture, buildLongSubjectFixture, buildManyConfirmableBranchesFixture, buildManyLandingsFixture, buildMessageParsingFixture, buildPathOneOnlyFixture, buildRemoteBaseFixture, buildRemoteTrackingFixture, buildRemoteTrackingMergedFixture, buildSelectedLandingCrowdedByNamelessFixture, buildUnpulledCloneFixture, buildWriteBoundaryFixture };
