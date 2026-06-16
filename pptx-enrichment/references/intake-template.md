# PPTX Enrichment Intake Template

Use this template to gather the minimum input before enriching a deck.

## Copy/Paste Intake

```markdown
Deck goal:
Audience:
Existing deck or template:
Slide limit or target length:

Brand name:
Primary logo:
Secondary logo:
Heading font:
Body font:
Primary colour:
Accent colour:
Background colour:
Tone:

Slides to add or revise:

New text to include:

New tables or pasted data:

Must-keep messages:

Must-avoid messages:

Sources or supporting files:

Deadline or delivery context:
```

## Normalized Output Shape

After intake, normalize the request into four buckets:

### Brand Brief

- name
- logos
- fonts
- colours
- tone

### Deck Brief

- audience
- purpose
- slide count
- base template or master

### Enrichment Inputs

- narrative blocks
- factual bullets
- raw tables
- appendix-only detail

### Open Questions

- missing brand assets
- unclear numbers
- conflicting instructions

## Table Cleanup Rules

When the user pastes raw table data:

- preserve original values
- standardize headers
- surface missing units
- detect which columns are numeric
- isolate totals and deltas
- remove duplicated columns before layout

## Output Expectations

The enriched output should usually contain:

- revised slide outline
- final slide copy
- cleaned tables ready for PowerPoint
- a short list of unresolved questions, if any
