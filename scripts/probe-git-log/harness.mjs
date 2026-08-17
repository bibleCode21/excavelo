/**
 * Shared probe machinery: the esbuild bundle of the modules under test, the
 * check runner and its failure list, the git and date helpers every fixture
 * builder uses, the assertion helpers that read loadGitLog's output, and the
 * wrapper that turns one of its throws into output to assert against.
 *
 * Nothing here builds a fixture or asserts anything. It is the floor the rest
 * of this directory stands on, and the only module that imports none of it.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";

// Three levels, not two: this file sits one deeper than the entry it was split out of.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-git-log-"));

// git-log.ts calls window.setTimeout/clearTimeout (obsidianmd/prefer-window-timers):
// real in Obsidian's Electron renderer, absent under plain Node — polyfill for the probe.
globalThis.window ??= { setTimeout, clearTimeout };

/**
 * MAX_BRANCHES is not exported, and A11 only tests anything while the probe's
 * idea of the cap matches the module's: hardcode 50 here and a changed cap
 * would leave A11 passing vacuously against a fixture that no longer reaches
 * it. Read it off the source instead — a changed cap moves the fixture with
 * it, and an unreadable one fails loudly rather than silently.
 */
const MAX_BRANCHES = Number(
  /const MAX_BRANCHES = (\d+)/.exec(
    fs.readFileSync(path.join(repoRoot, "src/core/git-log.ts"), "utf8")
  )?.[1]
);
assert.ok(Number.isInteger(MAX_BRANCHES), "could not read MAX_BRANCHES out of git-log.ts");

const MAX_GLOB_LENGTH = Number(
  /const MAX_GLOB_LENGTH = (\d+)/.exec(
    fs.readFileSync(path.join(repoRoot, "src/core/git-log.ts"), "utf8")
  )?.[1]
);
assert.ok(Number.isInteger(MAX_GLOB_LENGTH), "could not read MAX_GLOB_LENGTH out of git-log.ts");

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${String(e.message).split("\n").join("\n       ")}`);
  }
}

/**
 * Bundle git-log.ts with `obsidian` aliased to a stub. `t` is re-exported
 * alongside so error assertions can pin the i18n *key* rather than the
 * English wording — the contract preserves the key, not the text. buildPrompt
 * rides along for A9.
 */
function loadModule() {
  const stub = path.join(tmp, "obsidian-stub.js");
  const entry = path.join(tmp, "entry.ts");
  const out = path.join(tmp, "bundle.cjs");
  fs.writeFileSync(
    stub,
    "export const Platform = { isMobile: false, isDesktop: true };\n" +
      'export function getLanguage() { return "en"; }\n' +
      "export function requireApiVersion(_version) { return true; }\n"
  );
  fs.writeFileSync(
    entry,
    `export * from ${JSON.stringify(path.join(repoRoot, "src/core/git-log"))};\n` +
      `export { t } from ${JSON.stringify(path.join(repoRoot, "src/i18n"))};\n` +
      `export { buildPrompt } from ${JSON.stringify(path.join(repoRoot, "src/core/prompt"))};\n` +
      `export { STARTER_TEMPLATES } from ${JSON.stringify(path.join(repoRoot, "src/core/starter-templates"))};\n`
  );
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: out,
    alias: { obsidian: stub },
    logLevel: "warning",
  });
  return createRequire(import.meta.url)(out);
}

function makeGit(repo) {
  return (args, env = {}) =>
    execFileSync(
      "git",
      [
        "-C",
        repo,
        "-c",
        "user.name=probe",
        "-c",
        "user.email=probe@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }
    );
}

/** Author and committer date; one argument sets both. */
const at = (author, committer = author) => ({
  GIT_AUTHOR_DATE: author,
  GIT_COMMITTER_DATE: committer,
});

/**
 * loadGitLog returns one freeform string (I4). Section bodies carry blank
 * lines of their own (the pretty format opens with %n, --stat adds more), so
 * sections are cut on their header lines, never on blank lines.
 */
function sections(out) {
  const found = [];
  let cur = null;
  for (const line of out.split("\n")) {
    if (
      line.startsWith("--- landed ") ||
      line.startsWith("--- confirmed landed on ") ||
      line.startsWith("--- not yet on ")
    ) {
      cur = { header: line, body: [] };
      found.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
  }
  return found.map((s) => ({ header: s.header, body: s.body.join("\n") }));
}

/**
 * Deliberately still filters on `--- landed ` alone. `--- confirmed landed on`
 * is parsed as its own section above but is not one of these: every count over
 * landed sections (A11's most of all) would otherwise change meaning silently.
 * B15 asserts both halves of exactly this split.
 */
const landedSections = (out) => sections(out).filter((s) => s.header.startsWith("--- landed "));
const section = (out, header) => sections(out).find((s) => s.header === header);
/** Subject lines are rendered alone on a line; anchor so `n1` never hits `n10`. */
const hasSubject = (text, subject) =>
  new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(text);
const countOf = (text, needle) => text.split(needle).length - 1;

const mod = loadModule();
const { parseGitSpec, branchCandidates, expandHome, loadGitLog, buildPrompt, STARTER_TEMPLATES, t } = mod;

/**
 * A selection that drops to zero throws git.no-branches in glob mode. That has to
 * fail the check that asserted on the output, not crash the probe before the rest
 * of the run — so the throw is captured as output and asserted against like any
 * other. `matches` in selection-and-traversal.mjs wraps the same throw to a
 * different shape — a boolean, rethrowing anything that is not git.no-branches —
 * because its checks ask whether a glob matched, not what was rendered.
 */
const tryLoad = async (specs, memo) => {
  try {
    return await loadGitLog(specs, memo);
  } catch (e) {
    return `<threw: ${e.message}>`;
  }
};

export { MAX_BRANCHES, MAX_GLOB_LENGTH, STARTER_TEMPLATES, at, branchCandidates, buildPrompt, check, countOf, expandHome, failures, hasSubject, landedSections, loadGitLog, makeGit, parseGitSpec, section, sections, t, tmp, tryLoad };
