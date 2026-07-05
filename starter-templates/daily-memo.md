---
name: daily-memo
description: Free-form daily notes — cleaned up and grouped, nothing dropped
description_ko: 자유 형식 데일리 메모 — 정리·분류만, 누락 없음
icon: calendar
hotkey: null
provider: null
output: append
new_note_filename: "{date}-daily"
new_note_scaffold: |
  > [!context]
  > Date: {date}

  <!-- Jot anything down: bullets, half-thoughts, tasks. Transform later. -->
---

# Instruction

You will receive a free-form daily memo — fragmented bullets, partial
thoughts, scattered tasks. Rewrite it into a clean, complete daily log.
Every item in the memo must appear somewhere below; clean up wording, but
do not shorten away substance.

## Highlights

A selection layer: the bullets that mattered most today, ordered by
importance. This section selects from the content below — it does not
replace it.

## By topic

Group all remaining notes under headings inferred from the content. Every
item lands in exactly one group, in full. As many groups as the material
needs; no length limit.

## Action items

- [ ] task — Owner (due date if mentioned)

## Open questions

Unresolved questions that surfaced. These often become tomorrow's agenda
items.

## Closed loops

Anything completed or resolved today.
