---
name: pptx-enrichment
description: Enrich a PowerPoint deck with user-provided data, tables, narrative, and brand constraints while keeping the output presentation-ready and visually consistent. Use when the user wants to add their own perspective to a deck and needs explicit control over logos, fonts, colours, slide copy, table styling, and executive-summary structure.
---

# PPTX Enrichment

Use this skill when a user wants to add extra tables, data, commentary, or slide copy to a PowerPoint and keep the result aligned to a defined visual system.

## Use This Skill For

- Enriching an existing deck with new data, tables, and narrative.
- Turning a loose brief into slide-ready content with brand-safe formatting.
- Applying or documenting design rules for logos, typography, colours, and tables.
- Separating factual source material from user interpretation or recommendations.

## Non-negotiables

- Keep the presentation editable.
- Treat supplied metrics, pasted tables, and source text as the source of truth.
- Do not invent numbers, logos, brand colours, or named clients.
- Apply one clear brand contract before generating new slide content.
- If a base deck or corporate template exists, follow it before introducing new styling.
- Keep tables readable at presentation size. Split dense content instead of shrinking it into illegibility.

## Workflow

1. Collect the minimum viable input:
   - audience
   - deck goal
   - existing deck or template, if any
   - extra text, tables, or pasted data
   - brand kit inputs such as logos, fonts, colours, and tone
2. Normalize the request using the intake template below.
3. Apply the design contract in this file before producing new content.
4. Produce only the enrichment needed:
   - revised slide outline
   - paste-ready slide copy
   - cleaned tables
   - optional appendix content for overflow
5. Run the QA checklist in this file before delivery.

## Copy/Paste Intake Template

Use this exact structure when gathering inputs:

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

## Normalize The Request

After intake, normalize the request into four buckets.

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

## Design Contract

Use the following as the visual system when enriching slides.

### Brand Inputs

Capture these if available:

- Primary brand name
- Primary logo
- Secondary or partner logo, if needed
- Heading font
- Body font
- Primary colour
- Accent colour
- Neutral background colour
- Tone: formal, board-level, sales, investor, internal, or workshop

If some values are missing, inherit from the existing deck theme first.

### Logo Rules

- Use one primary logo consistently.
- Keep logos in a stable position across cover and section slides.
- Do not stretch, crop, recolour, or apply effects to supplied logos.
- Use a partner logo only when the relationship matters to the story.
- If dual logos are used, keep them visually balanced and separated by whitespace or a divider.

### Typography

Recommended structure:

- Cover title: `28-34 pt`
- Section title: `24-30 pt`
- Body headline: `18-24 pt`
- Body copy: `10-14 pt`
- Table text: `9-11 pt`
- Footnotes and source lines: `8-9 pt`

Rules:

- Use one heading family and one body family.
- Prefer weight and spacing changes over adding more fonts.
- Keep title case and sentence case consistent within the same deck.
- Avoid full paragraphs unless the slide is explicitly narrative.

### Colour System

Use a restrained palette:

- `1` primary brand colour
- `1` accent colour
- `1-2` neutrals for text and surfaces
- semantic green, amber, and red only when the deck uses status or variance signals

Rules:

- Put units of meaning on colours. Do not use accent colours randomly.
- Reserve the strongest colour for the key action, headline, or data emphasis.
- Avoid more than two saturated colours on a single slide.
- Ensure table fills and callouts do not reduce contrast.

### Layout Language

- Work in clear zones: title, insight, evidence, action.
- Use whitespace to separate content instead of extra borders.
- Keep repeated slide types visually consistent.
- When enriching an existing deck, mimic its margin system and headline placement.
- If a table and narrative compete, reduce the narrative first.

### Table Design

Tables are the most common enrichment surface. Apply these rules:

- Use concise headers with units in the header label.
- Right-align numeric columns.
- Left-align text labels.
- Use a distinct but subtle header fill.
- Zebra stripe only lightly.
- Use semantic variance colours for positive, negative, and neutral values.
- Keep totals or summary rows visually stronger than the body.
- Highlight only the one or two numbers the audience must notice.

If a table is too wide:

- reduce columns
- split the table by theme
- move detail rows to appendix

### Slide Types

Use a small set of repeatable slide types:

- Cover
- Executive summary
- Insight slide with evidence
- Table slide
- Comparison slide
- Appendix
- Closing slide

The user does not need every type on every job. Reuse only what improves clarity.

### Narrative Style

- Lead with the conclusion.
- Tie every claim to a metric, table, or named source when possible.
- Use the user's perspective as interpretation, not as a replacement for the underlying data.
- Avoid filler such as "unlocking value" or "driving synergies" unless the user explicitly wants that tone.

## Table Cleanup Rules

When the user pastes raw table data:

- preserve original values
- standardize headers
- surface missing units
- detect which columns are numeric
- isolate totals and deltas
- remove duplicated columns before layout

## Content Rules

- Keep executive slides short and decision-oriented.
- Make the difference between facts, interpretation, and recommendation obvious.
- Use titles that state the takeaway, not just the topic.
- Put long raw tables in appendix slides unless the table is itself the point.
- When the user adds their own perspective, fold it into callouts, speaker notes, or short narrative blocks rather than turning the whole slide into prose.

## When Brand Inputs Are Missing

- Prefer the existing PowerPoint theme or slide master.
- If there is no theme, use safe PowerPoint defaults and clearly mark missing brand items.
- Ask only for the smallest missing set that blocks quality: logo, primary colour, font choice, or audience.

## Expected Output

The enriched output should usually contain:

- revised slide outline
- final slide copy
- cleaned tables ready for PowerPoint
- a short list of unresolved questions, if any

## QA Checklist

Run this before delivering the enriched deck or deck content.

### Content QA

- Every headline states a takeaway.
- No invented metrics or unsupported claims appear.
- User perspective is clearly distinguished from raw source facts.
- Numbers, units, and date ranges are consistent.
- Overflow detail is moved to appendix instead of crowding core slides.

### Design QA

- Logos are not stretched, cropped, or duplicated unnecessarily.
- Font usage is consistent across headings, body copy, and tables.
- Accent colours are used intentionally, not decoratively.
- Spacing and alignment match the rest of the deck.
- The slide still reads cleanly from presentation distance.

### Table QA

- Headers are concise and readable.
- Numeric columns align correctly.
- Variance colours are semantically correct.
- Rows are not so dense that the audience cannot scan them live.
- Totals or priority rows are visually distinct.

### Delivery QA

- The deck remains editable.
- Missing brand items or content assumptions are called out explicitly.
- The final output matches the requested audience and tone.

## Repo-Specific QBR Mapping

Use this only when the skill is being applied with the bundled `qbr-pptx-service` in this repo.

### Current Direct Mappings

The existing generator already supports these payload controls:

- `themeName`
- `themeOverrides.companyName`
- `themeOverrides.logoText`
- `themeOverrides.fonts.heading`
- `themeOverrides.fonts.body`
- `themeOverrides.fonts.mono`
- `themeOverrides.colors.ink`
- `themeOverrides.colors.paper`
- `themeOverrides.colors.canvas`
- `themeOverrides.colors.accent`
- `themeOverrides.colors.accentAlt`
- `themeOverrides.colors.success`
- `themeOverrides.colors.warning`
- `themeOverrides.colors.highlight`
- `themeOverrides.colors.muted`
- `themeOverrides.colors.border`

### Content Fields To Populate

Typical enrichment requests map into these payload areas:

- executive narrative -> `programOutput`
- publisher narrative -> `publisherAnalysis`
- KPI table -> `programYoYTable`
- program breakdown -> `programScopeTable`
- publisher or segment detail -> `publisherTables`
- audience-facing title -> `deckTitle`
- business focus -> `qbrFocus` and `qbrFocusDetail`

### Current Limitation

The current generator in this repo uses a fixed Tradedoubler logo image on cover slides. Font and colour overrides map cleanly today, but custom raster logo swapping still depends on a service enhancement or an alternate PowerPoint template workflow.

Do not claim full arbitrary-logo automation when using the current service unless that enhancement has been implemented.
