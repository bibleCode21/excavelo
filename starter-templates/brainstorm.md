---
name: brainstorm
description: Brainstorm cleanup — cluster every idea, surface themes, propose next steps
description_ko: 브레인스토밍 정리 — 아이디어 묶기, 주제 도출, 다음 단계 제안
icon: lightbulb
hotkey: null
provider: null
output: append
new_note_filename: "{date}-brainstorm-{slug}"
new_note_scaffold: |
  > [!context]
  > Date: {date}
  > Topic: 

  <!-- Dump ideas, fragments, hunches. Transform groups them later. -->
---

# Instruction

You will receive a scattered list of ideas. Cluster them without losing any:
every idea in the source must appear in the output.

## Themes

Group every idea into themes. Each idea appears in exactly one theme, one per
bullet, with its substance preserved — quote distinctive phrasing verbatim.
Create as many themes as the material needs; no limit on theme count or size.

## Strong candidates

_Model judgment — a selection from the themes above, not a replacement._

The ideas that stand out — by novelty, feasibility, or fit — and why.

## Open questions

Questions raised by the brainstorm. These help direct further research.

## Next steps

- [ ] task — Owner (optional)
