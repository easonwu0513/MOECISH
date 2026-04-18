# MOECISH Design System — SKILL

**When to invoke:** the user is designing anything for MOECISH (教育部資通安全稽核改善管考系統), or needs a calm, white-first, audit-document-flavored UI in Traditional Chinese.

## Load order

1. `README.md` — product context, content rules, visual foundations, iconography, brand.
2. `colors_and_type.css` — the single source of tokens. Import into any artifact: `@import url('.../colors_and_type.css')`.
3. `ui_kits/moecish/` — interactive reference kit (login · dashboard · cycle · checklist · findings).
4. `preview/` — atomized preview cards for the Design System tab.
5. `assets/` — icons (`icons.tsx`), brand (`Logo.tsx`, `logo.svg`), enums (`types.ts`, `dimension.ts`), copy catalogue (`copy.ts`).

## Non-negotiables

- **Language is zh-Hant.** ROC years (`115 年度`), `zh-TW` long-form dates.
- **No emoji, no exclamation marks, no marketing gradients.** Color carries status; a soft radial halo is the only decoration allowed.
- **Preserve regulated terms verbatim** — `檢核表`, `稽核發現`, `改善措施`, `填報人`, `稽核委員`, `單位主管`, `平台管理員`. See `assets/copy.ts` for which strings are safe to tweak.
- **Three color signals are orthogonal** — role accent (sidebar strip + avatar ring), cycle status (chip), compliance (success/warning/danger/neutral). Don't collapse them.
- **Shadows are Linear-subtle.** If you see a drop shadow, it's probably too strong.
- **Tabular numbers everywhere a count appears.** `72 / 83` not `72/83`.
- **Icons are the in-house set** (`assets/icons.tsx`, 24/1.75/round). Lucide-static at 1.75 stroke is a fallback — flag it.

## Quick patterns

- Buttons: `.btn .btn-primary|tonal|secondary|ghost|success|danger` + size modifier.
- Chips: `.chip .chip-{neutral|primary|sage|success|warning|danger}` + `.chip-dot`.
- Cards: 1px hairline border, radius 14, elevate border (not shadow) on hover.
- Progress: ring for overall cycle, thin bar for dimension/row.
- Layout: 240px sidebar on `surface-muted` + 56px sticky topstrip + `max-w: 1280` content.

## Caveats

- Fonts load from Google Fonts CDN (Inter + Noto Sans TC + JetBrains Mono). Offline-bundle before ship.
- Logo SVG in `assets/logo.svg` is the source of truth; don't restyle/retint the shield.
