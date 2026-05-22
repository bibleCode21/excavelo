---
name: decision-record
description: ADR-style decision record — context, decision, alternatives, consequences
icon: gavel
hotkey: null
provider: null
output: new-file
output_filename: "{date}-decision-{slug}"
---

# Instruction

You will receive notes from a discussion where a decision was made. Rewrite
them as an Architecture Decision Record (ADR). Preserve the language of the
raw memo.

## Context

Two to four sentences. What forced this decision? What constraints, deadlines,
or prior commitments shaped it?

## Decision

State the decision in one or two declarative sentences. Plain language.

## Alternatives considered

Bulleted list. Each item: the alternative + why it was rejected. Be specific.

## Consequences

- **Positive**: what this enables.
- **Negative**: what costs or risks are accepted.
- **Open**: what is now newly uncertain.

## Follow-ups

- [ ] task — Owner (due date if mentioned)

## Sources

If raw notes referenced specific documents / meetings / people, list them.
