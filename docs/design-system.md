# Cineva Design System

This document defines the **single source of truth** for visual styling used throughout the Cineva application. All components should reference these tokens via CSS variables or Tailwind utilities.

---

## 1. Colour Tokens (dark, neutral graphite)

| Token | Value |
|------|-------|
| `--bg` | `#09090b` |
| `--surface-1` | `rgba(255,255,255,0.04)` |
| `--surface-2` | `rgba(255,255,255,0.08)` |
| `--line` | `rgba(255,255,255,0.09)` |
| `--text` | `#f5f5f7` |
| `--text-2` | `rgba(245,245,247,0.66)` |
| `--text-3` | `rgba(245,245,247,0.42)` |
| `--status-success` | `#5fd68a` |
| `--status-warning` | `#f5b84b` |
| `--status-danger` | `#ff6b6b` |
| `--primary-action-bg` | `rgba(255,255,255,0.9)` (near‑white pill) |
| `--primary-action-text` | `rgba(0,0,0,0.85)` |

---

## 2. Ambient Light (non‑video pages)

Two large blurred fields (≈ `rgb(70,78,150)` and `rgb(150,86,62)`) at ≤ 0.35 opacity, drifting ≥ 40 s (reduced‑motion disables). 5 % film grain.

---

## 3. Typography

- **Fonts**: Geist (sans) + Geist Mono (monospace), self‑hosted via `@fontsource-variable`. Pre‑load primary weight, `font-display: swap`.
- **Fallbacks**: Noto Sans Devanagari / Noto Sans Telugu for Indian scripts.
- **Scales (px)**: `12, 13, 14, 16, 18, 22, 28, 36, 48, 64`.
- **Weights**: `400 / 500 / 600`.
- **Line‑height**: `1.2` (headings) / `1.5` (body).
- **Letter‑spacing**: `-0.02em` for ≥ 28 px.
- **Case**: Sentence case.
- **Numbers**: Tabular numerals for counters, monospace for timecodes / room codes.

---

## 4. Spacing & Radii

- **Base spacing**: `4px`.
- **Scale**: `4, 8, 12, 16, 20, 24, 32, 40, 56, 80, 120`.
- **Radii**:
  - Inputs: `10px`
  - Buttons (cards, tiles): `16px`
  - Panels / stage: `24px`
  - Large cards: `32px`
  - Pills: `999px`
  - Inner radius = outer radius − padding.

---

## 5. Icons

- **Set**: Lucide only, stroke `1.6`, sizes `16/18/20/24`.
- **Alignment**: Icon and label share a centre line.
- **Playwright rule**: Fail on any SVG `< 12px` or `> 48px`.

---

## 6. Motion

- Durations: `150 ms / 200 ms / 300 ms`.
- Easing: `cubic-bezier(.22,.9,.3,1)`.
- Animations only on `transform` and `opacity`.
- Entrance pattern: fade + 8 px rise.
- Reduced‑motion disables everything except opacity.

---

## 7. Elevation

No coloured shadows. Solid surfaces: `1px` border + `0 18px 50px -14px rgba(0,0,0,.6)`.

---

## 8. Breakpoints

- Mobile: `< 900px`
- Desktop: `≥ 900px`
- Landscape‑phone special case: `(orientation: landscape) and (max-height: 500px)`.

---

## 9. Z‑Index Scale

| Layer | Z‑Index |
|-------|---------|
| Base | `0` |
| Stage | `1` |
| Overlays | `10` |
| Controls | `20` |
| Menus | `30` |
| Sheets | `40` |
| Modals | `50` |
| Toasts | `60` |

---

## 10. Liquid‑Glass Recipe (component: `<GlassSurface level="thin|regular|thick"/>`)

```css
.glass {
  position: relative;
  isolation: isolate;
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14),
              inset 0 0 0 1px rgba(255,255,255,.06),
              0 18px 50px -14px rgba(0,0,0,.6);
}
/* thin: bg rgba(30,30,36,.38) blur 20px
   regular: .52 / 32px
   thick: .72 / 44px */
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: conic-gradient(
    from 210deg,
    rgba(255,255,255,.5),
    rgba(255,255,255,.06) 20%,
    rgba(255,255,255,.03) 50%,
    rgba(255,255,255,.34) 74%,
    rgba(255,255,255,.06) 90%,
    rgba(255,255,255,.5)
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box,
               linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
```

---

## 11. Component Tokens (states: default, hover, active, focus‑visible, disabled, loading, error)

- **Button** (primary, secondary, ghost, danger, icon)
- **Input / Field** (label, hint, error)
- **Switch**
- **Segmented control** (sliding indicator)
- **Tabs**
- **Slider** (4 px track, thumb)
- **Select / Menu**
- **Popover**
- **Modal** (focus trap)
- **Bottom sheet** (grabber, swipe‑down, focus trap)
- **Toast** (stack, auto‑dismiss, `aria-live`)
- **Tooltip**
- **Badge / Tag**
- **Avatar**
- **Participant tile**
- **Progress**
- **Dropzone**
- **Code input** (6 boxes)
- **Empty state**
- **Skeleton**
- **Error screen**
- **Keyboard‑shortcuts dialog**

All components must use the CSS variables above for colours, radii, spacing, shadows, and motion.

---

## 12. Living Style Guide

A dev‑only route `/design-system` renders every component in every state over three backgrounds:
1. Ambient dark background (non‑video pages)
2. Bright video frame (simulated bright video)
3. Dark video frame (simulated dark video)

Take baseline screenshots for visual‑regression testing.

---

**STOP** – Review this design‑system definition and approve before we start wiring the components and cleaning up legacy values.
