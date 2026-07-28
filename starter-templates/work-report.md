---
name: work-report
description: Work report / release notes from git commits and memo — grouped by intent, outcomes first
description_ko: git 커밋과 메모 기반 작업 보고·릴리스 노트 — 의도별 묶음, 성과 중심
icon: git-commit
hotkey: null
provider: null
output: new-file
output_filename: "{date}-work-report"
new_note_filename: "{date}-work-report"
new_note_scaffold: |
  > [!context]
  > Date: {date}
  > Period: 

  > [!git] C:/path/to/repo since:7d

  <!-- Write your memo below: blockers, decisions, context the log cannot show -->
---

# Instruction

You will receive the author's memo and usually a GIT LOG from one or more
repositories. Produce a work report for the covered period.

Write for a reader (a teammate or manager) who wants to know what was
accomplished and what it means — not a commit listing. Group work by intent
(feature, fix, refactor, docs, infra), merge related commits into one
substantive line each, and lead with outcomes. Keep concrete anchors: numbers,
version tags, file/module names where they clarify scope. Use the memo for
context the log cannot show (why, blockers, decisions).

If a section has no content in the source, write "(none)"; do not invent work
that is not in the log or the memo.

## Summary

Three to five lines: the shape of the period's work and its most important
outcome.

## Completed

Work that has LANDED — every section of the GIT LOG, which contains nothing
else: `--- landed <date>` sections are the changes that reached the default
branch, and `--- confirmed landed on <base> branch: <name>` sections name
branches proven to have reached it (listed as commit subjects; a section with
no lines means that branch's commits are either among the `--- landed`
sections or not in this log at all — a `(landed <date>)` suffix names the one
landing that confirmed it, and its absence means only ancestry proved it). One
`###` subsection per work stream (feature, fix, etc. — name them by what they
achieve, not by branch or commit). Under each, tight bullets: what was done and
what it enables. Merge commit chains ("fix, fix again, really fix") into their
final result.

## In progress / carried over

Only what the memo itself describes as unfinished. One bullet each with current
state. The GIT LOG is no source for this section — work that has not reached the
default branch does not appear in it, so never infer that something is pending
from the log's contents or from its absence there.

## Issues and decisions

Problems hit, how they were resolved, and decisions made along the way —
from the memo first, commit messages second.

## Next

- [ ] planned item (from the memo; write "(none)" if the memo names nothing)
