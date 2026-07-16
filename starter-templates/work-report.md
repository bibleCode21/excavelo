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

Work that has LANDED — the GIT LOG's `--- landed <date>` sections, which are
the changes that reached the default branch and shipped. One `###` subsection
per work stream (feature, fix, etc. — name them by what they achieve, not by
branch or commit). Under each, tight bullets: what was done and what it
enables. Merge commit chains ("fix, fix again, really fix") into their final
result.

## In progress / carried over

Work that has not landed: the GIT LOG's `--- not yet on <base>` sections, plus
anything the memo describes as unfinished. One bullet each with current state.

Never report the same work here and under Completed. If it appears in both — a
branch's commits can still show as unlanded after their content shipped
squashed into one commit — it shipped: put it under Completed only.

## Issues and decisions

Problems hit, how they were resolved, and decisions made along the way —
from the memo first, commit messages second.

## Next

- [ ] planned item (from the memo; write "(none)" if the memo names nothing)
