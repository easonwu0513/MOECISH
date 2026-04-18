# MOECISH Design System

**MOECISH** — 教育部資通安全稽核改善管考系統 (Cybersecurity Audit Remediation Management)

> 讓每一次稽核都清楚、從容、留得下軌跡。

A calm, white-first, document-centric design language for a regulated compliance workflow. The system supports four roles (平台管理員 / 稽核委員 / 填報人 / 單位主管) moving an 83-item checklist and multi-round remediation cycle from draft → signed → reviewed → findings → approved/closed.

---

## Sources

- **Codebase:** `MOECISH/` (Next.js 14 App Router + Tailwind + Prisma). Tokens live in `MOECISH/tailwind.config.ts` and `MOECISH/src/app/globals.css`. Components in `MOECISH/src/components/ui/**`. Brand in `MOECISH/src/components/brand/Logo.tsx`. Copy in `MOECISH/src/lib/copy.ts`.
- Primary reference files:
  - `src/app/page.tsx` — dashboard / overview
  - `src/app/login/page.tsx` — auth
  - `src/app/cycles/[id]/page.tsx` — cycle detail
  - `src/app/cycles/[id]/checklist/ChecklistShell.tsx` — the 83-item module
  - `src/lib/types.ts`, `src/lib/dimension.ts` — enums + labels
  - `src/components/icons.tsx` — in-house 24×24 1.75px stroke icon set

---

## Index

| File | Purpose |
|---|---|
| `README.md` | This file — brand, content, visual, iconography docs |
| `SKILL.md` | Agent-invocable skill manifest |
| `colors_and_type.css` | CSS variables (colors, type, spacing, shadow, motion) + semantic styles |
| `fonts/` | Inter, Noto Sans TC, JetBrains Mono — loaded via Google Fonts in `colors_and_type.css` |
| `assets/` | Logo SVGs, role accents, `icons.tsx` (the full in-house icon set), copy of `copy.ts` |
| `preview/` | Small HTML cards that populate the Design System tab |
| `ui_kits/moecish/` | Interactive UI kit — login, dashboard, cycle, checklist, findings |

---

## The Product in 60 seconds

MOECISH replaces a paper (ODT) checklist + Word remediation-report workflow used by Taiwanese government agencies for annual 資通安全 (InfoSec) audits. It is a **regulated back-office tool** — not a marketing site, not a consumer app. Every screen must feel:

- **Trustworthy** — stamps, signatures, audit trails, precise date/time, ROC years.
- **Calm** — lots of white, little chrome, no marketing-voice gradients.
- **Precise** — tabular numbers, dimensional color (role + status), clear states.
- **Dense but not crowded** — 83-item checklists, 9 dimensions, 9 cycle statuses, 4 roles. Information architecture is a first-class component.

Two primary modules:

1. **模組一 — 檢核表填報** (Checklist). 83 items across 9 dimensions. Compliance level (符合 / 部分符合 / 不符合 / 不適用) + description + PDF evidence. Comment rounds between auditor and respondent.
2. **模組二 — 稽核發現與改善** (Findings & Remediation). Auditors raise findings (策略/管理/技術 × 法遵/待改善/建議). Respondents file root-cause, remediation, timeline, evidence. Multi-round review until APPROVED.

---

## Content Fundamentals

### Language

- **Primary language: Traditional Chinese (zh-Hant).** English appears only as product chrome (brand name, code, email).
- Function names, enum values, and status labels always read as concrete nouns: `稽核週期`, `稽核發現`, `改善措施`, `填報人`, `委員意見`. Never marketing synonyms.
- **Year format:** ROC (民國) — `115 年度`, not `2026`. Derived in code as `year - 1911`.
- **Dates:** `zh-TW` locale long form — `2026 年 4 月 18 日 星期六`.
- **Numbers:** always tabular (`tabular-nums`). `83 / 83`, `72%`, `5 項`.

### Tone

| Dimension | Stance | Example |
|---|---|---|
| Formality | 正式但不僵 | `目前還沒有稽核週期` — not `還沒有項目喔！` |
| Person | 避免 `您/我` 的氾濫；用動作 | `進入稽核週期` · `送出審核` · `標記為已補正` |
| Emotion | Calm, not cheerful | Empty todo state: `辛苦了，好好休息吧。` (rare warmth — earned) |
| Action verbs | Short, imperative | `儲存` `送出` `通過` `持續改正` `補正` |
| Error tone | Neutral, actionable | `操作失敗 · 請檢查網路或稍後再試。` |

### Rules

- **No emoji.** Ever. This is a government audit platform. Status is carried by chip color + dot.
- **No exclamation marks in production copy.** (Occasional `。` full-stop is fine.)
- **Sentence-case Chinese**, no all-caps English except UI chrome (`⌘K`, `MOECISH`).
- **Casing for English:** Title-case product name (`MOECISH`), `PascalCase` for role enums but always displayed in Chinese (`ADMIN` → `平台管理員`).
- **Preserve legal terms verbatim.** Audit language is regulated; don't rewrite `稽核發現` as `問題` or `檢核表` as `清單`. See `src/lib/copy.ts` — it explicitly carves out which copy is safe to tweak.
- **Hours-based greeting:** `早安` (< 11) / `午安` (11–18) / `晚上好` (≥ 18). Pairs with name, period: `午安，王小明。`

### Micro-copy voice samples (lifted from codebase)

- Tagline: `讓每一次稽核都清楚、從容、留得下軌跡。`
- Todo empty: `目前沒有待辦事項 · 辛苦了，好好休息吧。`
- Cycles empty: `目前還沒有稽核週期 · 等平台管理員開立稽核週期後，這裡就會顯示您的待辦。`
- Save toast: `已儲存 · 第 5.1 題更新完成，軌跡留存中。`
- Submit toast: `已送出審核 · 稽核委員會收到通知。`

---

## Visual Foundations

### Philosophy: white-first, airy, document-lineage

The UI descends from government forms and audit reports — but rendered with modern software chops (Linear/Notion-grade shadow subtlety, Inter's ss01/cv11 features). The goal is **a form that is a pleasure to fill in**, not a dashboard that is exciting to look at.

### Palette

- **Primary** — `primary-600 #3e72a8`. A desaturated clinical blue. Government-adjacent without being "Twitter blue." Scale 50→950.
- **Sage** — `sage-500 #678669`. Secondary accent. Carries the AUDITOR role and module-two surfaces. Quiet, not green-green.
- **Semantic** — `success #5a9e72`, `warning #d08b3b`, `danger #b8585a`. **All desaturated**. Tailwind's defaults are too loud for this context.
- **Neutrals** — cool-grey, 14 steps from `#ffffff` to `#121212`. Text is never pure black (`text-primary: #18181a`).
- **Surface** — `surface: #ffffff`, `surface-muted: #fafafa`, `surface-sunken: #f5f5f5`. App background is `#ffffff`; sidebar lives on `muted` to create layering without shadow.
- **Role accent (3px left strip in sidebar):** ADMIN → primary-400, AUDITOR → sage-400, RESPONDENT → neutral-300, SUPERVISOR → warning-400. Also used for `ring-2` on avatars.

### Typography

- **Sans:** Inter (400/500/600/700) + Noto Sans TC (300/400/500/600/700) stacked — Inter handles Latin/numbers, Noto picks up CJK.
- **Mono:** JetBrains Mono (400/500/600) — emails, item numbers in admin views, keyboard shortcuts.
- **Features on:** `cv11`, `ss01`, `ss03`, `cv02`, `cv03` + antialiased. Tabular nums everywhere counts appear.
- **Letter-spacing is negative at size** — `-0.038em` at `display-lg`, `-0.003em` at body. Heading rhythm (`-0.02em` on all h*).
- **Scale:**

  | Token | Size / LH | Use |
  |---|---|---|
  | `caption` | 12 / 18 | Hints, metadata, keyboard glyphs |
  | `label` | 13 / 18 · 500 | Form labels, filter chips |
  | `body-sm` | 14 / 1.45 | Secondary body, dense lists |
  | `body` | 15 / 1.6 | Default body (also the base) |
  | `title` | 17 / 1.5 · 500 | Card titles |
  | `title-lg` | 19 / 1.45 · 600 | Section headings |
  | `headline` | 24 / 1.25 · 600 | Page titles |
  | `display-sm` | 32 / 1.18 · 600 | Dashboard hero |
  | `display` | 40 · 600 | (reserved) |
  | `display-lg` | 48 · 700 | (reserved — marketing only) |

### Spacing

- 4px base; Tailwind default scale. Layout grid is 8px-aligned; component padding typically 16/24.
- **Container:** `max-w-screen-xl` (1280) with `px-4 sm:px-6 lg:px-8`.
- Cards default to `p-6`; heroes to `p-8`.

### Corner radii

- `xs 4` · `sm 6` · `DEFAULT 8` · `md 10` · `lg 12` · `xl 14` · `2xl 18` · `3xl 24`.
- Buttons: `rounded-md` (sm/xs) or `rounded-lg` (md/lg). Cards: `rounded-xl`. Menus / sheets: `rounded-2xl`. Chips: `rounded-full` (except xs which is `rounded-md` for number badges).
- Input focus outline is a `shadow-focus` ring (18% primary), not a border-color flip alone.

### Shadow & elevation

**Linear/Notion-inspired, ultra-subtle.** Nothing here should look "lifted." Five named steps:

```
xs  0 1px 0 0 rgba(15,20,30,.04)      // hairline receipt
sm  0 1px 2px 0 rgba(15,20,30,.05)    // default card hover
md  0 6px 16px -6px rgba(15,20,30,.08)+ 0 2px 4px -2px
lg  0 12px 28px -10px + 0 4px 10px -4px
xl  0 24px 48px -16px rgba(15,20,30,.14) // modal / command palette
```

Plus `inner-sm` for pressed input wells, and `focus` / `focus-danger` rings for accessibility.

### Borders

Three named hairlines — `hairline #f0f0f0` (default dividers) → `subtle #e8e8e8` (hover states) → `strong #d0d0d0` (definitive containers). Buttons' `secondary` starts at hairline, lifts to subtle on hover.

### Motion

- **Durations:** 80 / 180 / 250 ms. Default is 180.
- **Easings:** `smooth cubic-bezier(.4,0,.2,1)` for most state changes, `out-expo cubic-bezier(.16,1,.3,1)` for "arrivals" (fade-in, slide-up, slide-in-right).
- **Defined keyframes:** `fade-in` (2px Y), `slide-up` (8px Y + 0.985 scale), `slide-in-right` (sheet), `soft-pulse` (timeline nodes with live status).
- **Press feedback:** all buttons apply `active:scale-[0.98]` (non-disabled). No bouncy springs.
- **`prefers-reduced-motion: reduce`** cuts everything to 0.01ms.

### States

| State | Treatment |
|---|---|
| Hover (button) | Darken shade +1 (600 → 700), add `shadow-xs` on primary |
| Hover (card) | Border `hairline → subtle`, `shadow → shadow-sm` |
| Hover (ghost/nav) | `bg-neutral-50/100`, text lifts to `neutral-900` |
| Focus-visible | 3px ring at 18% primary (or danger for inputs in error) |
| Press | `scale 0.98` + shade +2 |
| Disabled | `opacity 50`, no shadow, cursor not-allowed |
| Selected (sidebar) | `text-primary-700`, 2px left rail bar, icon flips to `primary-600` |

### Transparency & blur

Use sparingly:

- Sticky toolbars: `bg-white/95 backdrop-blur-sm` + hairline border.
- Soft-tone chips: `bg-*-50/60-70` with `ring-1 ring-inset` to keep edges crisp on sunken surfaces.
- Modal scrims: `bg-neutral-900/40` (no blur — this is a form, not a camera).

### Imagery

- **No photography.** Government audit platform — stock photos break the tone instantly.
- **No illustrations.** If a hero needs flavor, use the logo shield + a very soft radial halo (see login page: 6% primary + 5% sage, off-screen ellipses).
- **Backgrounds:** default `#ffffff`. Never a gradient wash behind content. The one exception is the `.bg-noise` utility — a 3px radial dot at ~2% alpha to break up huge empty surfaces.

### Layout rules

- Sticky top strip (`h-14`) + fixed left sidebar (`w-64` / `w-16` collapsed). Main content scrolls inside `max-w-screen-xl`.
- Checklist uses a second sticky toolbar at `top-14` with search/filter/progress — stacked layering.
- Dialogs / sheets use `slide-up` or `slide-in-right`.
- Print stylesheet exists: `.no-print` hides chrome, body goes to white.

### Dimensional color system

Color carries three orthogonal signals — learn them in order:

1. **Role accent** — ADMIN primary / AUDITOR sage / RESPONDENT neutral / SUPERVISOR warning. Shown on avatar ring + sidebar left strip.
2. **Cycle status** — `DRAFT neutral` → `SUBMITTED primary` → `IN_REVIEW sage` → `RETURNED / FINDINGS / REMEDIATING warning` → `CLOSED success`. One of six chip tones.
3. **Compliance level** (checklist item) — `符合 success` / `部分符合 warning` / `不符合 danger` / `不適用 neutral`. Reinforced with a small dot, never color-only.

---

## Iconography

- **In-house icon set**: `src/components/icons.tsx` — currently 28 icons, Feather/Lucide style, 24×24 viewBox, `strokeWidth: 1.75`, round caps & joins, `currentColor` fill. See `assets/icons.tsx`.
- **No icon font, no CDN, no Lucide package dependency.** Authors handrolled each icon to keep the stroke weight consistent with the type (fine, not bold).
- **Usage:**
  - Always pass `size` explicitly. Defaults: 16 for inline buttons, 17 for sidebar, 18 for top-strip controls, 20 for empty-state thumbnails, 22 for module tiles.
  - Icons carry `stroke-*` tones set by parent (`text-neutral-400` default; `text-primary-600` when active).
  - Pair with text whenever feasible — icon-only buttons must have `aria-label`.
- **No emoji. No unicode symbols as icons** (except `⌘ ⏎ ⌥ ⇧` inside the `.kbd` component for keyboard hints).
- **If an icon is missing:** first add it to `icons.tsx` following the 24/1.75/round template. As a fallback when generating prototypes, lucide-static at matching 1.75 stroke weight is acceptable — flag the substitution. The kit ships the current 28 handrolled ones.

### Brand mark

- **Shield + checkmark** — a soft rounded shield with a gradient from `#5389bd` → `#27436a` plus a 45% white highlight (top-left), and a 2.6px white check. See `assets/logo.svg`.
- **Wordmark lockup** — 28px shield + two-line text (`MOECISH` 15px/600 tight; `資安稽核管考平台` 11px/500 gray) with 10px gap.
- **Minimum size:** 20px shield. Don't ever fill-black or tint the shield — it loses the legal-document cue.

---

## Caveats & Substitutions

- Fonts are loaded from Google Fonts CDN (Inter, Noto Sans TC, JetBrains Mono). No local `.woff2` files — same source as the production Next.js app.
- Icons are copied verbatim from the codebase. When using outside React, inline the SVG or import the file.
- The logo is reconstructed from `Logo.tsx` into a standalone SVG — byte-identical geometry.
