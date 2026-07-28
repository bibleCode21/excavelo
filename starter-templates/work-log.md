---
name: work-log
description: Dated work history from git commits — filtered by the memo's issue list, abstract one-line entries
description_ko: git 커밋 기반 업무내역 — 메모의 이슈 목록과 겹치는 작업만, 추상적인 한 줄 항목
icon: history
hotkey: null
provider: null
output: new-file
output_filename: "{date}-work-log"
new_note_filename: "{date}-work-log"
new_note_scaffold: |
  > [!git] C:/path/to/repo

  <!-- Paste the issue list or branch lines (branch-name  subject) for the period below -->
---

# Instruction

You will receive a GIT LOG from one or more repositories, usually with a short
memo. Produce a dated work-history list ("업무내역") in exactly the format
shown below — a changelog for non-developer readers (managers tracking what
shipped where), not a narrative report (that is the work-report template).

The output has no section headings of its own. It is a sequence of date
blocks, oldest first, in this shape (values illustrative):

```
2026-06-24 (수)

전자결재

[추가] [자회사A] 구매요청서 양식 신규 추가
[수정] [공통] 휴가신청서 상신 시 필수 입력 검증 개선

게시판

[수정] [공통] 공지 목록 정렬 순서 개선
```

Selection and abstraction (the two most important rules):

- Only work that has LANDED counts, and the GIT LOG contains nothing else: a
  `--- landed <date>` section is work that reached the default branch and
  shipped, and a `--- confirmed landed on <base> branch: <name>` section names
  a branch proven to have reached it. Work still sitting on an unlanded branch
  does not appear in the log at all, so never write anything from it as
  pending or still open.
- The RAW MEMO usually contains a list of the work handled during the period.
  It may take several forms: issue titles or ticket ids, or branch lines
  pasted straight from git (a branch name, often followed by a commit
  subject). Whatever the form, that list is the filter: include only work
  whose commits overlap an entry in the list. A pasted branch name is the
  most explicit form — select exactly the commits under the landing that
  carries that branch name. Issue titles match loosely by topic — issue
  wording and commit wording will differ; one issue often spans several
  commits (merge them into one entry). Work in the log that matches no listed
  entry is omitted entirely. Only when the memo provides no such list,
  include every user-visible change instead.
- The issue list is selection criteria, not content. An issue with no matching
  commits in the log produces no entry at all — never fabricate a date, module,
  or description for it. And never reinterpret a commit to force a match with
  an issue: match on what the commit actually says; when unsure, omit.
- When a landing header names a branch (`--- landed <date> branch: <name>`),
  that name is metadata: team conventions often encode a ticket id (e.g.
  SR2601-01234), affected company, date, and author. A ticket id or topic
  shared by an issue and a branch name is the strongest match signal — treat
  that landing's commits as that issue's work. When the issue and the branch
  both carry ticket ids and they differ, that argues against the match:
  connect them only if the topics clearly align. A landing may also carry
  commits inherited from another branch it was cut from; attribute each commit
  to the issue and branch it belongs to by its own message, and ignore
  inherited commits that belong to a different issue or match none.
- A landing header may carry no branch name (`--- landed <date> direct`, or
  `merge:` followed by a subject). That is normal — not every team's history
  records a branch name — and it is not a reason to skip the work. Match those
  commits to the issue list by their own messages and changed paths, exactly
  as you would issue titles.
- A `--- confirmed landed on <base> branch: <name>` section lists that branch's
  commit subjects rather than full commits: use them the same way, and use the
  branch name as the match signal described above. When such a section carries
  no lines at all, the branch reached the base but its commits are either
  among the `--- landed` sections instead or not in this log at all — do not
  write an entry from the header alone. A `(landed <date>)` suffix on the
  header names the one landing that confirmed the branch; its absence means
  only ancestry proved it, with no single landing to date.
- Keep every entry abstract, at the level of an issue title: name the feature
  or behavior that changed as a user or manager would describe it. Never
  include implementation detail — no file, function, or table names, no code
  identifiers, no parameter values, no step-by-step logic. Prefer the issue's
  own phrasing over the commit message's.
- The reader is a non-developer. Even within matched work, keep only changes
  a non-developer would notice or care about. Purely technical work —
  refactoring, internal tooling, test code, build or dependency changes,
  API/library compatibility fixes — is dropped even when it matches a listed
  entry; a matched entry consisting only of such work produces nothing.

Formatting rules:

- A date line per day that has work: `YYYY-MM-DD (weekday)`, weekday
  abbreviated in the output language (Korean: 수). Date = the date on the
  `--- landed <date>` header the work sits under, i.e. the day it reached the
  default branch — not the commit's own date, which is when it was written and
  is often earlier (work authored in June and merged in July belongs under the
  July date). Unless the memo specifies release/deploy dates — then group
  under those.
- Under each date, one block per module or feature area that changed
  (e.g. 전자결재, 게시판, 근태관리). Infer the module from commit messages and
  changed paths; prefer the memo's own terms when it names them.
- One entry line per user-visible change:
  `[tag] [scope] one-line description`.
- Tags in the output language: addition -> [추가], change/fix/improvement ->
  [수정], removal -> [삭제] (English: [Added]/[Changed]/[Removed]).
- Scope: the affected company/tenant in brackets when the commits or memo
  name one; otherwise [공통] (English: [Common]).
- Merge commit chains about the same change ("fix, fix again, adjust") into
  one final entry. Skip pure chores — merge commits, version bumps, wip —
  unless the memo says to include them.
- Each description is one concise line at the abstraction level above, ending
  in a noun form (개선/추가/수정 style), no trailing period.
- Within the selected scope, each change appears exactly once. Do not invent
  work that is not in the log or the memo.
