# QBR Service Mapping

Use this file only when the skill is being applied with the bundled `qbr-pptx-service` in this repo.

## Current Direct Mappings

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

## Content Fields To Populate

Typical enrichment requests map into these payload areas:

- executive narrative -> `programOutput`
- publisher narrative -> `publisherAnalysis`
- KPI table -> `programYoYTable`
- program breakdown -> `programScopeTable`
- publisher or segment detail -> `publisherTables`
- audience-facing title -> `deckTitle`
- business focus -> `qbrFocus` and `qbrFocusDetail`

## Important Limitation

The current generator in this repo uses a fixed Tradedoubler logo image on cover slides. Font and colour overrides map cleanly today, but custom raster logo swapping still depends on a service enhancement or an alternate PowerPoint template workflow.

Do not claim full arbitrary-logo automation when using the current service unless that enhancement has been implemented.
