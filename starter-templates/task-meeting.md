---
name: task-meeting
description: Internal task meeting minutes — key points by topic, decisions, action items, implications
description_ko: 내부 task 회의록 — 주제별 핵심 정리, 결정 사항, 작업 항목, 시사점
icon: clipboard-list
hotkey: null
provider: null
output: new-file
output_filename: "{date}-{slug}"
new_note_filename: "{date}-task-meeting-{slug}"
new_note_scaffold: |
  > [!context]
  > Date: {date}
  > Participants: 
  > Topic: 

  <!-- Write your raw meeting notes below. Attach an STT transcript with: > [!stt] [[transcript file]] -->
---

# Instruction

You will receive raw notes from an internal working-level task meeting,
possibly together with a speech-to-text transcript. Produce the minutes below.

Organize by topic with clear subheadings and enough detail that someone who
missed the meeting understands each topic and what was decided. Keep every
decision, requirement, constraint, number, owner, and deadline. But write for
essence: the key points and outcomes of each topic, not a play-by-play.

Be concise and clear. It is fine to be detailed where a topic is substantive —
do not strip technical specifics — but consolidate related remarks, state each
point once, and cut filler and repetition.

Two hard rules:

- Do NOT attribute statements to speakers. Never write "화자 1", "Speaker 2",
  "A said ...", or similar. Record what was discussed and decided, not who said
  it. The transcript's speaker labels are unreliable; ignore them.
- Do NOT build the participant list from the transcript — STT invents speakers.
  Participants come only from the author (see below).

If a section has no content in the source, write "(none)"; do not invent.

## Participants

Do not infer this from the transcript. If the raw memo lists participants, copy
them as written. Otherwise write a single placeholder line for the author to
fill in later (in Korean: "(참석자 직접 입력)").

## Discussion

One `###` subsection per topic that came up. Under each, tight bullets capturing
the substance of that topic: the points made, the reasoning, constraints, and
numbers. Consolidate the discussion into settled statements; do not narrate the
exchange. Every distinct point in the source lands in exactly one topic.

## Decisions

Bullet list. Each item names what was actually decided — not what was merely
discussed. If alternatives were considered, note them ("A over B because ...").

## Action items

- [ ] task — Owner (due date if mentioned)

## Open questions

Questions raised but not settled in the meeting.

## Implications

_Model inference — not stated in the source._

Non-obvious observations the discussion implies: unspoken tensions, risks nobody
named, patterns across topics. A few bullets at most. Keep clearly separate from
the factual record above.
