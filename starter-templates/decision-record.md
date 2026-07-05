---
name: decision-record
description: ADR-style decision record — full context, decision, alternatives, consequences
description_ko: ADR 형식 결정 기록 — 배경, 결정, 대안, 결과
icon: gavel
hotkey: null
provider: null
output: new-file
output_filename: "{date}-decision-{slug}"
new_note_filename: "{date}-decision-{slug}"
new_note_scaffold: |
  > [!context]
  > Date: {date}
  > Decision area: 
  > Stakeholders: 

  <!-- Capture the discussion / constraints / options leading to the decision -->
---

# Instruction

You will receive notes from a discussion where a decision was made. Rewrite
them as an Architecture Decision Record (ADR). This record is what future
readers will judge the decision by — include every piece of reasoning the
source contains. If a section has no content, write "(none)"; do not invent.

## Context

What forced this decision: constraints, deadlines, prior commitments, and the
situation that made the status quo untenable. Full detail from the source; no
length limit.

## Decision

State the decision declaratively, in plain language.

## Alternatives considered

Bulleted list. Each item: the alternative + every reason the source gives for
rejecting it. Be specific; keep numbers and names.

## Consequences

- **Positive**: what this enables.
- **Negative**: what costs or risks are accepted.
- **Open**: what is now newly uncertain.

## Follow-ups

- [ ] task — Owner (due date if mentioned)

## Sources

If the raw notes referenced specific documents / meetings / people, list them.
