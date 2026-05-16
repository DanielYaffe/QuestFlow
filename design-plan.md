# QuestFlow — Design Refresh Plan

**Date:** May 11, 2026
**Scope:** Replace the current dark-purple-with-amber-accents theme with a **retro/game-flavored dark UI** that reads as a crafted creator tool, not an AI product. Full-surface audit: design tokens → shadcn components → every shipped page → marketing/landing.

**Relationship to [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md):** This file is a sibling plan, on the same level as [CB-plan.md](CB-plan.md). It's independent from the engine roadmap and can be scheduled at any point — typically after core functionality stabilizes but before any public launch. Cross-references back to the parent plan name specific page implementations (e.g. SpriteGenerator from Plan 3.9, Character editor from Plan 4.6, QuestBuilder from Plan 9).

---

## Why Split This Out

A visual refresh is orthogonal to the engine/feature plans. Folding it into `ARCHITECTURE_PLAN.md` would either bloat already-long sections or scatter "and also change the styling here" notes through every page-related plan. Keeping it separate:
- Lets the design pass run as one focused chunk of work with its own task ordering.
- Avoids re-doing per-page styling work when those pages are still being rewritten in Plans 3/4/9.
- Makes the rationale (what AI tropes to remove, what tokens to use) reviewable as a coherent document.

The trade-off: every time a new page is built in the parent plan, the implementer should reference this file's tokens and the AI-trope inventory rather than reinventing styles ad-hoc.

---

## Current State (audited May 11)

Frontend stack: React 18 + Vite + Tailwind 4 + Radix UI + shadcn (46 UI components installed). Tokens live in [frontend/src/styles/theme.css](frontend/src/styles/theme.css) using Tailwind 4's native `@theme inline` block with OKLch color values bound to `:root` (light) and `.dark` (dark) selectors. No `tailwind.config.js`.

**Current palette:** Zinc baseline (zinc-950 backgrounds, zinc-900 cards, zinc-800 borders) + amber accents (for the fantasy loading screen sigils) + purple-600 sprinkled into focus states + per-card gradient variety on the Dashboard (rose→violet, emerald→teal, purple→blue, indigo→purple).

**AI-trope hits found:**
- `Sparkles` (lucide icon) in [TopNav.tsx](frontend/src/app/components/TopNav.tsx), [AISidebar.tsx](frontend/src/app/components/AISidebar.tsx), [CharacterDetailPanel.tsx](frontend/src/app/components/CharacterDetailPanel.tsx), [QuestBuilderHeader.tsx](frontend/src/app/components/QuestBuilderHeader.tsx).
- `backdrop-blur-sm` on [QuickActionCard.tsx](frontend/src/app/components/QuickActionCard.tsx) and [CharacterDetailPanel.tsx](frontend/src/app/components/CharacterDetailPanel.tsx).
- Multi-stop pastel gradients on Dashboard project cards ([Dashboard.tsx](frontend/src/app/pages/Dashboard/Dashboard.tsx)).
- Glow effects (`boxShadow: 0 0 32px rgba(251,191,36,0.7)`) on the QuestLoadingScreen mystical sigil.
- Purple focus rings on Login.

**Fonts:** None loaded — falls back to OS defaults. [frontend/src/styles/fonts.css](frontend/src/styles/fonts.css) is empty.

**Pages shipped (7):** `/login`, `/`, `/quest-builder`, `/quest-builder/:id`, `/create`, `/sprite-generator`, `/sprite-animator`. No landing/marketing surface yet.

---

## Design Direction

**Retro/game-flavored dark UI**, single theme (no light/dark switcher). The aesthetic reference points: Aseprite, the Godot editor, itch.io, late-90s game-magazine layouts, CRT-era restraint. Crafted, not generated.

Concrete vocabulary:
- **Backgrounds**: warm dark — not pure black, not blue-black. A slight brown/charcoal undertone so it doesn't feel sterile.
- **Borders**: crisp 1px, occasionally inset/outset to suggest physical chrome. No soft shadows on UI chrome.
- **Accents**: muted earth tones (burnt orange, ochre, parchment) — the opposite of saturated synthetic gradients. Saving high saturation for the *content* (pixel-art sprites are vibrant; the UI around them is not).
- **Typography**: a sans for body + UI, a slab/serif or pixel-flavored display face for section titles, a true monospace for technical fields (IDs, S3 keys, JSON previews). Avoid Inter — it's the AI-product default.
- **Motion**: minimal. No shimmer, no pulse-glow, no decorative animation on idle UI. Animation reserved for affordance feedback (button press, sprite-candidate appearing).
- **Iconography**: prefer hand-drawn or 1px-line icons over rounded-corner lucide defaults. Where lucide stays, force `strokeWidth: 1.5` and never use the decorative-sparkle subset.

---

## Plan D-1: AI-Trope Inventory & Replacements

Every item below is a thing in the current UI (or commonly slipping in) that codes "AI product." For each, the table names the trope, where it shows up, and the concrete replacement.

| # | Trope | Where it appears | Replacement |
|---|---|---|---|
| D-1.1 | **Purple / violet / indigo accents** | Login focus states, Dashboard project cards (purple→blue, indigo→purple), QuestCreate wizard accents | Drop purple from the token palette entirely. Replace with `--accent: oklch(0.62 0.15 50)` (burnt orange) as the sole interactive accent. |
| D-1.2 | **Pastel multi-stop gradients on cards** | Dashboard project cards (`bg-gradient-to-br from-rose-... via-violet-... to-blue-...`) | Solid fill on cards with a single 1px accent border. Variety comes from a small project-icon glyph (3-5 hand-picked SVGs), not from background color. |
| D-1.3 | **Sparkle (`Sparkles`) icon as the "AI does this" signifier** | TopNav menu item, AISidebar header, CharacterDetailPanel regen buttons, QuestBuilderHeader | Replace with a `Wand` / `PenTool` / `RefreshCw` icon depending on context. Never use `Sparkles`. Add a custom 1px pixel-art glyph for "AI action" if a dedicated icon is needed; the Lucide sparkle is banned. |
| D-1.4 | **"Generate with AI" badges, ✨/🤖 emoji labels** | Buttons throughout SpriteGenerator and (future) Character editor | Buttons read `Generate`, `Refine`, `Regenerate` — no AI branding. The user already knows it's AI; calling it out repeatedly is the chatbot-product aesthetic. |
| D-1.5 | **Backdrop blur / frosted glass** | QuickActionCard, CharacterDetailPanel modal | Replace with opaque dark fills + 1px borders. Blur reads "iOS chatbot UI"; opaque panels read "tool." |
| D-1.6 | **Glow/pulse effects on idle elements** | QuestLoadingScreen amber sigil glow, animate-pulse on QuestStoryView progress | Remove idle motion. Loading state is a crisp determinate progress bar with a current-step label, not a mystical orbiting-runes screen. Mystical theming is content, not UI chrome. |
| D-1.7 | **Soft drop shadows on cards (`shadow-lg`)** | Most card components | 1px borders only (`border border-zinc-800` or its retro equivalent). Drop shadows code "modern SaaS"; flat borders code "editor." |
| D-1.8 | **Rounded-corner button defaults (`rounded-lg`, `rounded-xl`)** | Every button | `rounded-sm` (2px) maximum. `rounded-none` for primary action surfaces. Anti-skeuomorphic, anti-iOS-pill. |
| D-1.9 | **Default Inter / Geist body font** | Implicit (no font loaded yet — falls back to OS default) | Load actual fonts (see D-2.3). The "no font loaded" state currently looks unintentional but neutral; once we ship to public it must look chosen. |
| D-1.10 | **Chat-bubble / message-list framing for generators** | (Not present today, but tempting to slide into when building the Character editor's "Refine" interaction) | Refine inputs are inline text fields under the section they're refining, never floating chat bubbles. The agent's output replaces the section content directly — it does not "reply." |
| D-1.11 | **"AI / Smart / Magic" copywriting** | Any label like "AI suggestions", "Smart fill", "Magic regenerate" | Plain verbs. `Generate stats`, `Refine appearance`, `Suggest moves`. Never the words "AI", "smart", "magic" in UI copy. |
| D-1.12 | **Gradient text (`bg-clip-text` rainbow titles)** | (Not present today — watch for it during the refresh) | Solid `text-zinc-100` for headings; the display font carries the visual interest. No clipped gradients. |
| D-1.13 | **Generic glassmorphism / "AI hero panel"** | Not present yet but a common drift | Banned. If a hero is needed (Login, Landing), use a static pixel-art illustration as the hero asset. |
| D-1.14 | **Animated background particles / mesh gradients** | Not present yet | Banned. Static, no parallax, no decorative motion outside affordance feedback. |

When in doubt during the refresh: **"Would Aseprite ship this?"** is the test. If the answer is no, it's an AI-product reflex and goes.

---

## Plan D-2: Design Tokens (Tailwind 4 `@theme`)

All tokens live in [frontend/src/styles/theme.css](frontend/src/styles/theme.css). Replace the current `:root` / `.dark` blocks with a single dark-only token set. Remove `.dark` selector wrapping; the app is dark-by-default.

### D-2.1 Color tokens

```css
@theme inline {
  /* Surface — warm-dark, not blue-black */
  --color-bg:           oklch(0.18 0.012 60);  /* charcoal, warm undertone */
  --color-surface-1:    oklch(0.22 0.012 60);  /* card */
  --color-surface-2:    oklch(0.26 0.012 60);  /* raised card / popover */
  --color-surface-3:    oklch(0.31 0.012 60);  /* input fill, hover */

  /* Ink */
  --color-fg:           oklch(0.94 0.005 80);  /* parchment-white */
  --color-fg-muted:     oklch(0.72 0.008 80);  /* secondary text */
  --color-fg-faint:     oklch(0.55 0.008 80);  /* tertiary / disabled */

  /* Chrome */
  --color-border:       oklch(0.34 0.010 60);  /* 1px borders */
  --color-border-strong: oklch(0.42 0.012 60); /* focused, active */

  /* Accent — burnt orange, sole interactive accent */
  --color-accent:       oklch(0.62 0.150 50);  /* primary action */
  --color-accent-fg:    oklch(0.16 0.012 60);  /* text on accent (very dark) */
  --color-accent-hover: oklch(0.68 0.150 50);
  --color-accent-faint: oklch(0.30 0.060 50);  /* selection bg, focus ring */

  /* Semantic — desaturated, retro-flavored, not Bootstrap-bright */
  --color-success:      oklch(0.62 0.110 145); /* mossy green */
  --color-warning:      oklch(0.72 0.130 80);  /* ochre */
  --color-danger:       oklch(0.58 0.150 25);  /* rust red */
  --color-info:         oklch(0.62 0.080 230); /* dusty blue */

  /* No purple, no violet, no indigo, no fuchsia tokens. */
  /* Dashboard project-card gradients are removed. */
}
```

Migration: any `bg-purple-*`, `bg-violet-*`, `bg-indigo-*`, `from-rose-*`, `via-violet-*`, `to-blue-*` class found in the codebase is a refactor target. The grep for these defines the page-by-page checklist (D-4).

### D-2.2 Radius, spacing, motion

```css
@theme inline {
  --radius-sm: 2px;    /* default for buttons, inputs */
  --radius:    3px;    /* cards, panels */
  --radius-lg: 4px;    /* modals — still crisp */

  --shadow-1:  inset 0 -1px 0 0 var(--color-border-strong); /* button bottom edge */
  --shadow-2:  inset 0 0 0 1px var(--color-border);         /* card border */
  /* No soft drop shadows. All "elevation" is via 1px insets. */

  --motion-fast:    80ms cubic-bezier(0.4, 0, 0.2, 1);
  --motion-default: 140ms cubic-bezier(0.4, 0, 0.2, 1);
  /* No motion tokens > 200ms. No `transition-all` defaults. */
}
```

### D-2.3 Typography tokens & font loading

Add three webfonts via [frontend/src/styles/fonts.css](frontend/src/styles/fonts.css) (`@font-face` with woff2 only, self-hosted under `frontend/public/fonts/`):

| Role | Font | Why |
|---|---|---|
| Body / UI | **IBM Plex Sans** | Open, slightly mechanical, not Inter. Designed for technical UI. |
| Display | **VT323** or **Press Start 2P** (pixel) for hero/marketing; **Source Serif 4** for in-app section titles | Two display options — pixel face for landing/login hero, serif for in-app to avoid pixel-font fatigue. |
| Monospace | **IBM Plex Mono** | Pairs with Plex Sans. Used for IDs, JSON previews, sampler params in the Admin Styles view. |

```css
@theme inline {
  --font-sans:    'IBM Plex Sans', system-ui, sans-serif;
  --font-display: 'Source Serif 4', Georgia, serif;
  --font-pixel:   'VT323', 'Press Start 2P', monospace;  /* hero-only */
  --font-mono:    'IBM Plex Mono', ui-monospace, monospace;

  --text-xs:   0.75rem;   /* 12px */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  2rem;
  --text-display: 3rem;   /* hero only */
}
```

Typography in `@layer base` (in `theme.css`):
- `h1` → `--font-display`, `--text-3xl`, weight 600.
- `h2, h3` → `--font-display`, `--text-xl`/`--text-lg`.
- Body → `--font-sans`, `--text-base`, line-height 1.5.
- Buttons → `--font-sans`, `--text-sm`, weight 500, letter-spacing 0.01em.
- Code/IDs → `--font-mono`.

### D-2.4 Token removal checklist

When the new tokens land, the following must no longer appear anywhere in the codebase:
- `purple-*`, `violet-*`, `indigo-*`, `fuchsia-*`, `rose-*`, `pink-*` Tailwind classes.
- `bg-gradient-to-*` with multi-stop pastel runs.
- `backdrop-blur*` classes.
- `shadow-lg`, `shadow-xl`, `shadow-2xl` (anything > `shadow-sm`).
- `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` (except true circles like avatars).
- `animate-pulse`, `animate-shimmer`, `animate-bounce` on idle UI.
- The Lucide `Sparkles` icon.

A CI lint (D-5.3) enforces these bans going forward.

---

## Plan D-3: Component Refresh (shadcn/Radix)

46 shadcn components are installed. Most automatically inherit the new tokens. A subset needs explicit visual work:

### D-3.1 Components that re-style themselves via tokens (no per-file work)

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `badge`, `breadcrumb`, `calendar`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hover-card`, `input-otp`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `slider`, `sonner`, `switch`, `table`, `tabs`, `toggle-group`, `toggle`, `tooltip`.

These reference CSS variables; new tokens propagate.

### D-3.2 Components needing explicit edits

| Component | Edit |
|---|---|
| `button` | Remove rounded-md default → `rounded-sm`. Variants: `default` (accent fill, dark text), `secondary` (surface-2, fg), `ghost` (no fill, fg-muted on hover surface-2), `destructive` (danger fill), `outline` (1px border, fg). Remove the `link` variant (chat-product aesthetic). Add `xs` size for icon-only toolbar buttons. |
| `card` | Solid surface-1 fill, 1px border, `rounded` (3px), no drop shadow. Drop the `glass` / `gradient` variants if any. |
| `input`, `textarea` | Surface-3 fill (not surface-1), 1px border, focus-visible swaps to `border-strong` + accent ring — **not** a glow ring. Remove pill-style fully-rounded variant. |
| `avatar` | Keep `rounded-full` (this is the one place circles are correct). Default ring removed. |
| `progress` | Determinate bar, accent fill on surface-2 track. Remove gradient fill and any animated shimmer in the indeterminate variant; indeterminate is a single moving block, not a shimmer. |
| `skeleton` | Solid surface-2 with `animate-pulse` reduced to 1.5s linear (less "AI shimmer"-coded). Or remove animation entirely and rely on a static placeholder bar — to be decided in the design pass. |
| `chart` (recharts wrapper) | Re-theme axes/gridlines to use `--color-border`, series colors drawn from a 6-stop palette mixed from the accent + semantic colors, not Recharts' default rainbow. |
| `carousel` | Remove decorative gradient overlay if any. Arrows are square ghost buttons, not pills. |

### D-3.3 New custom components (not in shadcn)

- **`PixelDivider`** — a 1px horizontal rule with a small inset notch every 16px, evoking pixel-art rulers. Used between top-level page sections to replace soft `Separator` everywhere we currently use it.
- **`ToolPanel`** — `<aside>` wrapper that frames sidebars in the Character editor and QuestBuilder with a 1px border + a 24px header strip. Replaces ad-hoc sidebar styling.
- **`SectionHeader`** — display-font label + optional right-aligned action slot, used at the top of every coexisting section on the Character editor (Plan 4.6).
- **`StatusPill`** — a 1px-border pill (no fill) showing job status (idle / queued / running / done / failed). Uses semantic color tokens for the border, not the background.

---

## Plan D-4: Page-by-Page Refresh

Every page is walked once after D-2 + D-3 land. For each page: grep for banned classes (D-2.4), replace per-context using the new tokens and components, then visual review.

### D-4.1 Login (`pages/Login/Login.tsx`)
- Hero: replace the Sword icon header with a **pixel-art splash** asset (small static PNG, sized for retina). Splash is the only place the pixel display font appears.
- Form: 1px-bordered inputs, accent-fill primary button, ghost button for "Continue with Google". Drop purple focus rings → accent ring.
- Background: solid `--color-bg`. No gradients, no particles.

### D-4.2 Dashboard (`pages/Dashboard/Dashboard.tsx`)
- **Critical change.** Drop the per-card pastel gradients entirely. Each project card becomes:
  ```
  ┌──────────────────────────┐
  │ [glyph]  Project name    │
  │          questline count │
  │ ─────────────────────    │
  │ updated 3d ago           │
  └──────────────────────────┘
  ```
  Variety comes from a **6-glyph icon set** (sword, scroll, beast, gem, map, star — hand-drawn 24×24 SVGs). Auto-assigned by hash of project ID, user-overridable in project settings.
- Quick actions: drop `backdrop-blur-sm`. Solid surface-2 with 1px border, accent icon.
- "Recent characters" tray: thumbnail strip using the character's `snappedSpriteS3Key` (Plan 4) with name underneath, no card chrome.

### D-4.3 QuestBuilderLanding (`pages/QuestBuilder/QuestBuilderLanding.tsx`)
- Project picker: same card style as D-4.2.

### D-4.4 QuestBuilder (`pages/QuestBuilder/QuestBuilder.tsx`)
- XyFlow node theme: rewrite to use new tokens. Node = surface-1 fill, 1px border, accent border when selected. Edges = `--color-fg-muted`. No glow.
- Header: replace `Sparkles` icon with `Wand`. Page title in display serif.
- Node-edit drawer: `Sheet` component already inherits tokens; verify no leftover purple in the variant selector.
- AISidebar: rename to `AssistantSidebar`, replace `Sparkles` icon with `Wand`. Heading copy: "Assistant" not "AI Assistant".

### D-4.5 QuestCreate (`pages/QuestCreate/QuestCreate.tsx`)
- 5-step wizard: replace the wizard's progress indicator with a determinate `progress` bar + numbered steps below. Drop any glow/shimmer.
- Loading state ([QuestLoadingScreen.tsx](frontend/src/app/components/QuestLoadingScreen.tsx)): rewrite. Current orbiting-runes mystical sigil is decorative and codes "magic-AI fantasy." Replace with a horizontal scanline-style progress strip showing the current generation step in plain text ("Generating objectives…", "Generating characters…"). Reuse `SectionHeader` + `progress`.

### D-4.6 SpriteGenerator (`pages/SpriteGenerator/SpriteGenerator.tsx`)
- After Plan 3.9 lands the new picker UI, restyle: style cards are 1px-bordered surface-1 panels with 64×64 preview thumbnails; selection = accent border. No glow on hover, no scale transform.
- The `Sparkles` menu icon in TopNav becomes `Image` or a custom pixel-art generator glyph.

### D-4.7 SpriteAnimator (`pages/SpriteAnimator/SpriteAnimator.tsx`)
- Timeline bar: monospace frame labels, accent scrubber. Onion-skin toggle is a square `Toggle` not a switch.
- Animation list: vertical list with row hover = surface-2. No icons next to anim names — names are mono.

### D-4.8 Character Editor (Plan 4.6, future)
- When built (it doesn't exist yet), use `ToolPanel` + `SectionHeader` throughout. Sprite candidates grid: 1px-bordered cells, accent border on the selected candidate.
- `[Generate]` / `[Refine]` / `[🔒]` controls are square ghost buttons. Lock icon is a 1px-line custom SVG, not lucide's filled lock.

### D-4.9 Admin Styles view (Plan 3.10, future)
- Read-only debug surface — lean into the technical aesthetic. Display all fields in `--font-mono`. Tabular layout, no cards. Looks like a config file printout.

### D-4.10 Marketing / Landing (new — does not exist today)
- New route `/` (public, no auth) becomes a landing page; the authenticated home moves to `/app` (or `/dashboard`).
- Single long page: hero (pixel-art splash + tagline + one CTA) → "What you can build" (three pixel-art screenshots of actual app output) → "How it works" (3-step text + small diagram) → footer.
- All copy avoids "AI", "magic", "smart", "powered by".
- No video, no animated gradient hero, no testimonial carousel.

---

## Plan D-5: Implementation Tasks

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| D-5.1 | Rewrite `theme.css` with new tokens (D-2.1, D-2.2, D-2.3); remove `:root` light block; remove all purple/violet/indigo/rose/fuchsia hsl values | — | `frontend/src/styles/theme.css` | ⬜ |
| D-5.2 | Add webfonts to `fonts.css` + place woff2 files under `frontend/public/fonts/` | D-5.1 | `frontend/src/styles/fonts.css`, `frontend/public/fonts/*.woff2` | ⬜ |
| D-5.3 | Add ESLint / stylelint rule banning the classes in D-2.4 + a `no-restricted-syntax` rule banning `import { Sparkles } from 'lucide-react'` | D-5.1 | `eslint.config.js` (or `.eslintrc.json`), `.stylelintrc` | ⬜ |
| D-5.4 | Restyle `button`, `card`, `input`, `textarea`, `progress`, `skeleton`, `chart`, `carousel` (D-3.2) | D-5.1 | `frontend/src/app/components/ui/*.tsx` | ⬜ |
| D-5.5 | Build new custom components: `PixelDivider`, `ToolPanel`, `SectionHeader`, `StatusPill` (D-3.3) | D-5.1 | `frontend/src/app/components/chrome/*.tsx` | ⬜ |
| D-5.6 | Replace lucide `Sparkles` usage everywhere (TopNav, AISidebar→AssistantSidebar, CharacterDetailPanel, QuestBuilderHeader) | D-5.4 | scattered — grep for `Sparkles` | ⬜ |
| D-5.7 | Source / draw 6 project-glyph SVGs for D-4.2 dashboard cards | — | `frontend/src/app/assets/glyphs/*.svg` | ⬜ |
| D-5.8 | Refresh Login page (D-4.1) | D-5.1, D-5.4 | `frontend/src/app/pages/Login/Login.tsx` | ⬜ |
| D-5.9 | Refresh Dashboard (D-4.2) — drop pastel gradients, switch to glyph cards | D-5.7 | `frontend/src/app/pages/Dashboard/`, `QuickActionCard.tsx` | ⬜ |
| D-5.10 | Refresh QuestBuilderLanding (D-4.3) | D-5.9 | `frontend/src/app/pages/QuestBuilder/QuestBuilderLanding.tsx` | ⬜ |
| D-5.11 | Refresh QuestBuilder + AssistantSidebar + XyFlow node theme (D-4.4) | D-5.5, D-5.6 | `frontend/src/app/pages/QuestBuilder/`, `components/AISidebar.tsx` | ⬜ |
| D-5.12 | Rewrite QuestLoadingScreen → flat determinate progress (D-4.5) | D-5.4 | `frontend/src/app/components/QuestLoadingScreen.tsx`, `pages/QuestCreate/` | ⬜ |
| D-5.13 | Restyle SpriteGenerator after Plan 3.9 lands (D-4.6) | Plan 3.9, D-5.4 | `frontend/src/app/pages/SpriteGenerator/` | ⬜ |
| D-5.14 | Restyle SpriteAnimator (D-4.7) | D-5.4 | `frontend/src/app/pages/SpriteAnimator/` | ⬜ |
| D-5.15 | Style the Character editor page when Plan 4.6 builds it (D-4.8) | Plan 4.6, D-5.5 | `frontend/src/app/pages/Character/CharacterEditor.tsx` | ⬜ |
| D-5.16 | Style the Admin Styles view when Plan 3.10 builds it (D-4.9) | Plan 3.10, D-5.4 | `frontend/src/app/pages/Admin/Styles/` | ⬜ |
| D-5.17 | Build marketing / landing page at public `/`; move authenticated home to `/app` (D-4.10) | D-5.4, D-5.7 | `frontend/src/app/pages/Landing/`, `App.tsx` (router) | ⬜ |
| D-5.18 | Visual regression smoke: take Playwright screenshots of every page before and after; review with the team | D-5.8–D-5.17 | `e2e/visual.spec.ts` | ⬜ |

---

## Plan D-6: Acceptance Criteria

The refresh is complete when all of the following are true:

1. **Token audit clean.** No `purple|violet|indigo|fuchsia|rose-(?!,)|from-.*via-.*to-` Tailwind classes anywhere under `frontend/src/`. The lint rule (D-5.3) blocks reintroduction.
2. **No Sparkles icon import** anywhere in the codebase.
3. **No `backdrop-blur*` usage** on any UI chrome (cards, modals, panels). Acceptable only on intentional content effects, if any.
4. **No idle motion.** `animate-pulse` / `animate-shimmer` / `animate-bounce` appear only inside `Skeleton` (and even there only if the design pass keeps it) and indeterminate `Progress`.
5. **No `shadow-(lg|xl|2xl)` on UI chrome.** Elevation is 1px borders.
6. **Every shipped page renders correctly** at default dark token values without a `.dark` selector active anywhere.
7. **Fonts load** (network request goes to `/fonts/*.woff2` on every page); falling back to system fonts must not happen on production builds.
8. **Visual regression review passes.** Side-by-side before/after screenshots reviewed; no remaining "AI product reflex" elements flagged.

---

## Plan D-7: Risks & Notes

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pixel display font on hero looks dated or unreadable at small sizes | Hero feels amateur, not retro | Use VT323/Press Start 2P **only** at ≥32px on hero. Source Serif handles everything else display-sized. |
| Removing all motion makes the app feel unresponsive | Reduced perceived performance | Keep affordance-feedback motion (button press 80ms scale, candidate-card fade-in 140ms). The ban is on *decorative* idle motion. |
| Restyling shadcn `button` / `input` breaks every page silently | Production styling regression | Visual-regression Playwright run (D-5.18) gates the merge. |
| Plans 3.9, 4.6, 3.10 land *after* D-5.4 but before D-5.13/15/16 | New pages built against the old tokens, then re-restyled | Make D-5.1–D-5.5 happen *first*. New pages built after that automatically inherit the new tokens; no double work. |
| Designer disagrees with "retro/game-flavored dark" direction after seeing it on real pages | Multi-week rework | The token system (D-2) is direction-agnostic. If the direction shifts (e.g. to "editorial light"), only the color values in `theme.css` change; the structural refresh (no purple, no gradients, no sparkles, 1px borders, no drop shadows) is correct under any direction. |
| Lucide icons (1.5px stroke retro look) clash with the pixel display font | Inconsistent iconography | If clash is real, replace key icons with a small custom 16×16 pixel-art icon set; lucide stays as fallback for the long tail. |

---

## Cross-References to Parent Plan

| Parent plan | Design-plan section touching it |
|---|---|
| Plan 3.9 (SpriteGenerator UI) | D-4.6, D-5.13 — design pass runs after Plan 3.9's new picker UI lands |
| Plan 3.10 (Admin Styles view) | D-4.9, D-5.16 — design pass styles the new admin surface |
| Plan 4.6 (Character editor page) | D-4.8, D-5.15 — design pass styles the new page after Plan 4.6 builds it; `ToolPanel`/`SectionHeader` (D-3.3) are the chrome it relies on |
| Plan 9.7 (Characters list page) | Implicitly covered by D-2 + D-3 (no page-specific entry — generic card/list components carry it) |
| Plan 11 (prompt architecture) | None directly. AI-trope inventory D-1.4 / D-1.11 enforces that prompt-architecture UX never surfaces as "AI" branding. |
