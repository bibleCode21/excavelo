---
name: meeting
description: Cross-team or external meeting record — purpose, key points, decisions, implications, action items
description_ko: 타팀·외부 미팅 회의록 — 회의 목적, 핵심 논점, 확정 사항, 시사점, 작업 항목
icon: handshake
hotkey: null
provider: null
output: new-file
output_filename: "{date}-{slug}"
new_note_filename: "{date}-meeting-{slug}"
new_note_scaffold: |
  > [!context]
  > Date: {date}
  > Participants: 
  > Topic: 

  <!-- Write your raw meeting notes below. Attach an STT transcript with: > [!stt] [[transcript file]] -->
---

# Instruction

You will receive notes from a meeting with another team or an external party —
the author's memo, often together with a speech-to-text transcript of a long
recording. Produce the meeting record below.

Write for a reader who needs the outcome: the key points, what was decided, and
what happens next — not a transcript of the conversation. This template
deliberately selects and consolidates; it does not preserve every utterance.
Keep every decision, agreement, requirement, constraint, number, owner, and
deadline. Drop greetings, small talk, repetition, and background the
participants already share.

Be concise and clear. Do not over-compress — a decision or its reason must stay
understandable — but state each thing once, plainly, with no filler. Prefer a
tight bullet over a paragraph.

Two hard rules:

- Do NOT attribute statements to speakers. Never write "화자 1", "Speaker 2",
  "A said that ...", or similar. Record what was discussed and decided, not who
  said it. The transcript's speaker labels are unreliable; ignore them.
- Do NOT build the participant list from the transcript — STT invents speakers
  who were never there. Participants come only from the author (see below).

If a section has no content in the source, write "(none)"; do not invent.

## Participants

Do not infer this from the transcript. If the raw memo lists participants, copy
them as written. Otherwise write a single placeholder line for the author to
fill in later (in Korean: "(참석자 직접 입력)").

## Purpose

Two to four lines: why this meeting happened and what it needed to settle.

## Discussion

One `###` subsection per topic that mattered. Under each, a few tight bullets
capturing the substance: the point, the agreed approach, key constraints and
numbers, and alternatives considered with the reason one won. Consolidate the
back-and-forth into settled statements rather than narrating who reacted how.

## Confirmed decisions

Bullet list of what was actually settled — one bullet per decision, phrased as
a fact ("A over B", "X is required"), with owner and date when stated.

## Action items

- [ ] task — owner (due date if mentioned)

## Implications

_Model inference — not stated in the source._

Non-obvious consequences, risks, or follow-ups the decisions imply but nobody
said outright. A few bullets at most. Write "(none)" if nothing meaningful.
Keep this clearly separate from the factual record above.

## References

Documents, systems, API specs, or materials mentioned that the reader may need.
Write "(none)" if none.
