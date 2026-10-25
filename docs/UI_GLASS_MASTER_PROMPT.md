# CINEVA — DEEPSEEK HARNESS MASTER PROMPT: UI-ONLY GLASSMORPHISM REDESIGN (REVERSIBLE)

Save as `docs/DEEPSEEK_UI_MASTER_PROMPT.md` in the repo. Re-read it at the start of every session.

---

## 0. THE JOB IN ONE PARAGRAPH

Cineva already works (rooms, sync, call, chat, media pipeline, tunnel). I want to TEST a new front-end look: professional glassmorphism / liquid-glass surfaces, a refined layout and typography, and tasteful cursor effects. **Change presentation only. Do not change logic, behaviour, server code, data flow, routes, copy, test ids or tests' meaning.** I must be able to switch back to the current ("classic") look at any time, in under one minute, with zero risk. This is an experiment: keep the classic styles intact.

---

## 1. HOW YOU MUST WORK (DeepSeek Harness rules)

1. **Small steps.** One step at a time from section 8. After each step: run the checks in section 9 for that step, commit, append to `docs/UI_EXPERIMENT.md` (what changed, how verified, what's next). Never batch several steps into one commit. If a step is bigger than ~15 files, split it.
2. **Evidence, not claims.** Never say something works without command output, a test result, or a measured value. If a check fails, say so and show the output.
3. **You may not be able to see images.** If you cannot view screenshots, do NOT guess how it looks. Use programmatic verification (computed styles, bounding boxes, contrast ratios, pixel sampling, DOM assertions, Playwright screenshot diffs) and, at every STOP, give me the screenshot file paths so I can look. Tell me honestly which visual judgements you could not make.
4. **Workspace-only.** Work only inside the `cineva` repo. Ask before anything outside it. **Never** change macOS system settings (DNS, network, power, security), never kill processes you didn't start, never delete files you didn't create (print the path before any `rm`). My dev servers are probably running on ports 4000 (API) and 5173 (web): do not stop them; use other ports for your own test servers (e.g. web 5174, API 4001) and stop only those.
5. **No secrets, no media in git.** Don't commit `.env`, uploads, fixtures from real movies.
6. **Stay in scope.** If you think a logic or copy change would improve the result, don't do it: write it under "Suggestions (not applied)" in `docs/UI_EXPERIMENT.md` and keep going.
7. **STOP points** (marked STOP): finish, present evidence, wait for my reply.

---

## 2. REVERSIBILITY (do this FIRST, before any change)

1. Run `git status` and `git log --oneline -5`. Current branch should be `feature/ui-polish` (last known commit `1016f77`). If the tree is dirty, STOP and tell me; do not stash or reset on your own.
2. Create a rollback tag and a new branch:
   `git tag ui-classic-baseline` then `git switch -c ui/deepseek-glass`.
3. Record the baseline: run typecheck, build and tests (last known: **254 tests passing**, 0 type errors) and save the output to `docs/ui-experiment/baseline-checks.txt`. Capture baseline screenshots of every screen (section 7) at 1440×900 and 412×915 into `docs/ui-experiment/classic/`.
4. **Two ways back, both must work:**
   - **Git (guaranteed):** `git switch feature/ui-polish` (or `git checkout ui-classic-baseline`) restores the classic UI exactly. Document this in `docs/UI_EXPERIMENT.md`.
   - **Runtime switch:** implement an `Appearance` setting: **Classic** or **Glass**. `html[data-ui="classic"|"glass"]`. Resolution order: URL `?ui=classic|glass` (also saved) → `localStorage["cineva.ui"]` → build default `VITE_DEFAULT_UI` (default `glass` on this branch). A small "Appearance" segmented control lives in the room's settings menu, the landing footer, and `/design-system` if it exists. Switching applies instantly without reload and without losing room state. Add a visible tiny link "Back to classic look" on landing/create/join footers.
5. **How the switch works (strict):** ALL new visual code is scoped under `html[data-ui="glass"]` (CSS) or runs only when that attribute is set (JS effects). With `data-ui="classic"` the app must render exactly as it does on the baseline. You may ADD wrapper elements, extra classes and data attributes, but you may NOT remove, rename or reorder existing elements, classes, ids, aria attributes or `data-testid`s, and you may not delete classic CSS in this experiment (this overrides the usual "remove dead code" rule until I approve a cleanup). Prove it: Playwright screenshots in classic mode before vs after must match with `maxDiffPixelRatio ≤ 0.001` (mask nothing except the clock-like dynamic regions, and say which).

---

## 3. LOGIC FREEZE (what you may and may not touch)

**Allowed to edit/add:** CSS, Tailwind config/theme tokens, CSS variables, fonts (self-hosted via `@fontsource-variable`), purely presentational React components (a `GlassSurface`, `Spotlight`, `MagneticButton`, `CursorRing`, `AmbientBackground`, `AppearanceSwitch`), className/props changes on existing components, additive wrapper elements, SVG/icon sizing, static assets.
**Forbidden (must have ZERO diff):** `apps/server/**`, `packages/shared/**`, socket handlers, API clients (`apps/web/src/services/**`), hooks and stores that hold state or behaviour (`useSyncWatch`, `useIdleControls`, call/WebRTC managers, keyboard-shortcut hooks, chat state), routing, validation, media code, tests' assertions (you may add NEW tests; you may only update an existing test if it asserts a CSS class that you renamed, and you must list each such change for me), copy/text content (except where I approve), ids, aria-labels, `data-testid`s, keyboard behaviour, `package.json` dependencies (allowed additions: fonts only, plus nothing else without asking).
**Enforce it with a guard:** create `scripts/check-ui-only.mjs` that runs `git diff --name-status ui-classic-baseline...HEAD` and FAILS if any changed file is outside the allowlist (`apps/web/src/**/*.{css,scss}`, `apps/web/tailwind.config.*`, `apps/web/index.html` (fonts/meta only), `apps/web/public/**`, `apps/web/src/components/ui/**`, `apps/web/src/styles/**`, `apps/web/src/effects/**`, `docs/**`, `scripts/check-ui-only.mjs`, and `.tsx` files in `apps/web/src/{pages,components,features}/**` ONLY when the diff in them contains no changes to function bodies other than className/style/JSX wrapper edits; implement this check as: the diff lines must match a conservative pattern or be listed in `docs/ui-experiment/tsx-changes.md` with a one-line justification each). Wire it to `npm run check:ui-only`. Run it before every commit and at the end; paste the output.

---

## 4. DESIGN DIRECTION

Goal: premium, calm, and alive. "Apple-grade glass over a soft coloured backdrop", not a neon gradient wall. Real depth (layers, light, soft shadows), generous spacing, strong typographic hierarchy, restrained motion.

**Backdrop (ambient):** near-black base (`#07070a`), two or three large blurred colour fields (slow drift ≥ 40 s) tuned LOW-saturation (violet `~rgb(88,80,190)`, rose `~rgb(176,84,120)`, teal `~rgb(40,120,140)` at ≤ 0.35 effective opacity), 4–5% film grain. In the Room the colours come from the existing ambient-light sampling (do not touch that logic; only style its output). Never let a saturated colour fill a whole glass surface: glass must read as frosted neutral with a hint of the backdrop.

**Glass levels** (`GlassSurface level="thin|regular|thick"`):
```
thin    bg rgba(255,255,255,.06)  blur 18px  saturate 160%   (chips, pills, tooltips)
regular bg rgba(255,255,255,.08)  blur 28px  saturate 170%   (cards, sidebar, nav)
thick   bg rgba(18,18,24,.62)     blur 40px  saturate 150%   (menus, modals, sheets, control bar over video)
all:    border 1px rgba(255,255,255,.10); inner top highlight inset 0 1px 0 rgba(255,255,255,.22);
        soft shadow 0 24px 60px -20px rgba(0,0,0,.55); specular rim = conic-gradient border via mask (bright top-left & bottom-right)
        a very light noise overlay (2–3%) to prevent banding
```
Fallbacks (required): `@supports not (backdrop-filter)` → opaque `rgba(26,26,34,.94)`; `prefers-reduced-transparency`, `prefers-contrast: more`, `forced-colors` → solid surfaces with visible borders. Text on glass must keep WCAG AA contrast against the WORST backdrop (bright frame); add an inner dark tint where needed.
**Rules:** glass only on floating or grouped surfaces (nav, cards, sidebar, menus, modals, control bar, toasts); never nest glass in glass beyond menu-over-bar; max two backdrop-filter layers over the playing video; never animate blur radius, width/height or box-shadow (animate `transform` and `opacity` only).

**Type & space:** Geist (UI) + Geist Mono (timecodes, room codes), self-hosted, preloaded. Scale 12/13/14/16/18/22/28/36/48/64; weights 400/500/600; tight headings (−0.02em ≥ 28px); sentence case; clear hierarchy (a page title must be visibly larger than its body text). 4 px spacing grid. Radii: 10 inputs, 16 buttons/tiles, 24 panels, 32 large cards, 999 pills; inner radius = outer − padding. Icons: Lucide, stroke 1.6, sizes 16/18/20/24, always explicit; icon + label on one centre line.
**Colour roles:** text `#f5f5f7` / 66% / 42%; primary action = near-white pill with near-black text; success `#5fd68a`, warning `#f5b84b`, danger `#ff6b6b`; ONE soft accent for focus rings and active states (`rgba(150,140,255,.9)` for rings, used sparingly). No gradient text, no neon glows, no coloured shadows, no brand colours on buttons (the WhatsApp button becomes a neutral glass button with its icon).
**Motion:** 150/200/300 ms, `cubic-bezier(.22,.9,.3,1)`; one entrance pattern (fade + 8 px rise, staggered 40 ms); respect `prefers-reduced-motion` (opacity only).

---

## 5. CURSOR EFFECTS (only when `data-ui="glass"`, fine pointer, no reduced motion)

One delegated `pointermove` listener on `document` (passive), throttled with `requestAnimationFrame`, writing CSS variables; no per-element listeners, no layout reads in the hot path except one cached `getBoundingClientRect` per hovered element on `pointerenter`.
1. **Spotlight:** glass cards/panels get `--mx/--my`; a radial highlight (`rgba(255,255,255,.14)`, radius 360px) follows the cursor INSIDE the surface, fading in/out over 200 ms. Also brightens the specular rim near the cursor.
2. **Rim light:** the conic rim's start angle rotates toward the cursor position over the surface (smoothly, max 12°/frame).
3. **Magnetic primary buttons:** buttons with `data-magnetic` translate up to 6 px toward the cursor when within 70 px, easing back on leave (transform only). Not on touch, not on disabled buttons, not in the Room's control bar.
4. **Tilt:** hero product mock and the Create/Join cards tilt ≤ 3° following the cursor (perspective 1200px), with a 400 ms ease back. Not on any surface that contains a `<video>`, input focus, or while dragging.
5. **Backdrop parallax:** ambient fields shift ≤ 14 px opposite to the cursor on landing/create/join only (transform on a GPU layer, lerped).
6. **Cursor ring (optional, default ON on landing/create/join, OFF in the Room):** a 28 px translucent ring that trails the pointer (lerp 0.18), grows to 44 px over interactive elements (`a, button, [role=button], input`), shrinks on press; hidden over text inputs, textareas and while a native/OS cursor is required; system cursor stays visible (do not set `cursor:none` globally). Toggle in Appearance ("Cursor effects").
**Hard exclusions:** none of these effects run over the video stage while a movie plays, inside the control bar, in the call tiles, or on touch devices (`(pointer: coarse)`), and all stop when `prefers-reduced-motion` is set or the tab is hidden. All effects are disabled with a single master switch (`html[data-fx="off"]`, set by Appearance → "Cursor effects: Off"). Performance budget: effects code ≤ 6 KB gzip, main-thread cost ≤ 1 ms per frame, no long tasks > 50 ms caused by effects (measure with a Playwright trace and report).

---

## 6. ELEMENT-LEVEL DIRECTION (from my current screenshots)

Keep every layout's structure and behaviour; improve their look:
- **Landing:** nav pill = `regular` glass (remove the heavy purple/pink fill); the nav shows both "Join" and "Join room": hide the duplicate link visually via CSS only if one is redundant (otherwise leave). Headline 64/72px max, tight; sub-copy 18–20px at 66% opacity; two hero buttons equal height 52px (primary white pill, secondary glass); the hero product mock = `regular` glass with tilt; floating chips = `thin` glass; "avatars + 'No accounts…'" aligned on one baseline; steps and join band as cards with spotlight; footer quiet. Tone the backdrop down to the low-saturation palette above.
- **Create:** card = `regular` glass, max-width 560px; the title "Create your watch room" must be a real heading (28px/600) clearly above the 15px muted subtitle; labels 13px/500 muted; inputs 52px, radius 16, inset shadow, visible focus ring; dropzone with clear idle/hover/drag-over/file-selected states; "Create Room" full-width primary pill; secondary link row quiet. The small badge "Host Studio · 4K Sync" is hype: restyle neutral and put the suggestion "remove or rename" under "Suggestions (not applied)".
- **Ready screen ("Your Watch Room is Ready!"):** sentence case is a copy change, so keep the text but fix the typography (balanced wrap, 36px, no orphan lines), the room code displayed in a mono chip with comfortable letter-spacing and a copy affordance, **Copy Link** and **WhatsApp** equal width and height (48px) neutral glass buttons, **Enter Theater** primary full width below; remove the neon glow under the button; subtle success check badge (green tint, no glow).
- **Join:** same card system as Create; six code boxes 56×64 with mono digits, clear active box; same hierarchy rules.
- **Room (desktop):** keep structure. Top bar = `regular` glass pill; stage with no extra frame, subtle outer ring; control bar = `thick` glass floating with 16 px inset, seek track 4 px with clear filled part; sidebar = ONE `regular` glass panel; tiles with 16 px radius and clear host/mute/quality badges; chat bubbles (others: `thin` glass; mine: near-white with dark text); activity lines small and muted; composer pill. No cursor effects over the stage while playing.
- **Call-only fullscreen panel ("Back to Screening"):** big tile grid inside a `regular` glass container, bottom dock = floating `thick` glass pill with Mute / Camera / Back to Screening (primary), equal heights, icon+label aligned.
- **Add Video modal and other modals/menus/toasts:** `thick` glass, 24 px radius, backdrop dim + 14 px blur, consistent header (icon badge, title, subtitle, close), footer buttons right-aligned (secondary + primary), focus trap unchanged.
- **Mobile (< 900 px):** same system; no cursor effects; bottom sheets `thick` glass; touch targets ≥ 44 px; no horizontal overflow at 320–430 px.

---

## 7. SCREENS TO COVER (for baseline, build and tests)

Landing (top, features, join band), Create (empty, file selected, error, preparing, ready), Join (empty, prefilled, error), Room (empty, playing with controls, controls hidden, each menu open, subtitle settings, People tab, call-only panel, Add Video modal, sidebar hidden), Waiting/locked/denied screens if present, Diagnostics, 404. Desktop 1440×900 and mobile 412×915 at minimum.

---

## 8. STEPS (in order; commit after each)

1. **Safety setup (section 2):** tag, branch, baseline checks + classic screenshots, `check:ui-only` script. → report.
2. **Switch + tokens:** `data-ui` mechanism, Appearance control, `VITE_DEFAULT_UI`, CSS variables/Tailwind tokens, fonts, `GlassSurface`. Prove classic mode is pixel-identical to baseline. → **STOP** (show me the switch working).
3. **Ambient backdrop + glass primitives + fallbacks** (no page restyling yet), a dev-only `/design-system` page showing every component in classic vs glass if routing already supports adding a dev route without logic change; otherwise skip it and say so.
4. **Landing** restyle + cursor effects wired (spotlight, rim light, magnetic, tilt, parallax, cursor ring). → **STOP** with screenshots + performance numbers.
5. **Create + Ready screen + Join.**
6. **Room desktop** (top bar, stage chrome, control bar, sidebar, tiles, chat, modals, menus, toasts, call-only panel). → **STOP**.
7. **Mobile pass** for every screen.
8. **Polish + QA gates** (section 9), `docs/UI_EXPERIMENT.md` finalised with before/after galleries, how to switch back, "Suggestions (not applied)", and a short list of every `.tsx` file touched with why. → **STOP** for my decision (keep glass / go back to classic).

---

## 9. CHECKS (run what applies at every step; paste real output)

1. `npm run check:ui-only` passes (no forbidden path touched).
2. `npm run typecheck`, `npm run build`, `npm test`: all green with the same test count as baseline (254) or more; no existing test changed except as listed.
3. **Classic parity:** screenshots with `data-ui="classic"` equal the baseline (≤ 0.1% pixels).
4. **Console:** zero errors/warnings from our code on every screen in both modes (Playwright guard).
5. **Layout:** no horizontal overflow 320–2560; no clipped children; no overlapping interactive elements; no layout shift (CLS < 0.02) when switching Classic ↔ Glass.
6. **Accessibility:** axe zero serious/critical; keyboard-only path through Create → Room works unchanged; visible focus ring on every interactive element; text contrast AA on glass over bright and dark backdrops (pixel-sampled); `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`, `forced-colors` emulations render correctly.
7. **Effects:** a Playwright test dispatches pointer events and asserts `--mx/--my` update; asserts effects are OFF on touch emulation, with reduced motion, with `data-fx="off"`, over the playing video stage and in the control bar; asserts the cursor ring never covers an input being typed in; measures main-thread cost (trace) and long tasks.
8. **Performance:** landing LCP < 2.2 s, CLS < 0.02 on the dev build profile; JS added by this experiment ≤ 12 KB gzip total; with the glass control bar over a playing 1080p test video, dropped frames ≤ 1% more than classic (otherwise reduce blur radius over video and re-measure).
9. **Reversibility:** a test switches Classic → Glass → Classic inside a live room (host + guest contexts): playback, sync, chat and call state are unaffected (no reload, no reconnect, same DOM nodes for the video element); `?ui=classic` and `localStorage` both work; `git switch feature/ui-polish` restores the classic build (run it once on a temp worktree and run the unit tests there).
10. Final `docs/UI_EXPERIMENT.md`: the three ways to go back (toggle, URL, git), gallery paths, numbers from all checks, known limitations, suggestions not applied.

**Do not say the experiment is finished while any check fails. Report failures plainly with the evidence and a proposed fix.**
