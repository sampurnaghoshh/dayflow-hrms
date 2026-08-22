# Dayflow HRMS — Design Notes

## Design direction

Dayflow is designed as a calm, practical internal HR tool rather than a marketing website. The interface prioritizes clarity, consistency, information density, and fast everyday use.

The visual system uses deep pine as the primary colour and signal amber only for information that needs attention.

## Colour system

The primary colour is deep pine. It is used for primary actions, selected states, and positive/success states.

Signal amber is reserved exclusively for pending items and attention states such as pending approvals and unread alerts.

Danger colours are used for rejected, absent, and error states.

Muted grey is used for cancelled, weekend, and holiday states.

## Status colour mapping

| Status | Background | Text |
|---|---|---|
| PENDING | `--amber-100` | `--amber-600` |
| APPROVED / PRESENT | `--pine-100` | `--pine-700` |
| REJECTED / ABSENT | `--danger-100` | `--danger-600` |
| CANCELLED | `--surface-sunken` | `--ink-muted` |
| HALF_DAY | `--info-100` | `--info-500` |
| ON_LEAVE | `--info-100` | `--info-500` |
| HOLIDAY / WEEKEND | `--surface-sunken` | `--ink-muted` |

## Typography

Bricolage Grotesque is used for display headings.

Inter is used for normal interface text because it remains readable at small sizes.

JetBrains Mono is reserved for the leave-balance ledger transaction tape. This makes the ledger visually distinct without introducing unnecessary monospace text elsewhere in the application.

## Spacing and layout

The design system uses a 4px base spacing scale.

The main content area has a maximum width of `1200px`.

The desktop sidebar is `240px` wide and changes to bottom navigation on screens below `768px`.

Cards use consistent padding and spacing rather than individually chosen values.

## Tables

Tables use hairline row borders and sticky headers.

Numbers that need to be compared vertically are right-aligned.

Dates, IDs, monetary values, and other comparable numeric values use tabular figures.

Rows use the pine selected/hover treatment consistently.

## Leave ledger

The leave balance is presented as a transaction tape rather than a chart.

Each transaction shows:

- Date
- Reason
- Delta
- Running balance

Credits are shown in pine and debits use the normal ink colour.

A reversal is never hidden or deleted. `REVERSAL` rows receive the amber tint so that cancelled leave is visibly represented as a reversal of the original transaction.

The monospace treatment is intentionally limited to this ledger.

## Accessibility

Interactive elements use the defined focus ring so keyboard users can clearly see the current focus.

The design system includes reduced-motion support through `prefers-reduced-motion`.

Colour is not the only way status information is communicated; status labels remain visible alongside colour treatments.

## Responsive behaviour

The layout is designed for desktop and mobile use.

Desktop pages use the sidebar navigation and larger page spacing.

On screens below `768px`, navigation moves to a bottom bar and page padding is reduced.

Tables and dense information areas must remain usable at narrow widths.

## Design principles

1. Prefer consistency over decoration.
2. Use colour to communicate meaning, not decoration.
3. Keep important information easy to scan.
4. Use the defined spacing and typography system rather than arbitrary values.
5. Preserve the meaning of historical records instead of hiding or deleting them.
6. Make errors understandable and actionable.
