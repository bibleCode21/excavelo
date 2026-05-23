---
name: meeting-minutes
description: Standard meeting minutes — participants, discussion, decisions, action items
icon: clipboard-list
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

  <!-- Write your raw meeting notes below this line -->
---

# Instruction

You will receive raw meeting notes. Rewrite them as proper meeting minutes
using the structure below. Preserve the language of the raw memo (do not
translate). If a section has no content in the source, write "(none)" — do
not invent.

## Participants

List every person mentioned. For each: name, role / team in parentheses
if inferable from the context, otherwise just the name.

## Key discussion

Two to four short paragraphs covering the main topics. Stay factual; do
not editorialize. Quote distinctive phrases when they carry meaning.

## Decisions

Bullet list. Each item names what was actually decided — not what was merely
discussed. If alternatives were considered, the bullet can briefly note them
("A over B because ...").

## Action items

- [ ] task — Owner (due date if mentioned)

## Key takeaways

Two to three non-obvious observations. Things that are implied by the
discussion but were not stated explicitly. Useful for future review.
