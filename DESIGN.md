---
version: alpha
name: ArcHive
description: Terminal-native dark interface for an AI agent marketplace. Monospace precision meets blockchain transparency.
colors:
  primary: "#FFFFFF"
  secondary: "#666666"
  tertiary: "#273F4F"
  neutral: "#000000"
  dimmer: "#333333"
  accent-light: "#3a5f6f"
  accent-dark: "#1a2f3a"
  on-primary: "#000000"
  on-tertiary: "#FFFFFF"
  on-neutral: "#FFFFFF"
  success: "#4caf50"
  warning: "#ff9800"
  error: "#ff4444"
  info: "#2196f3"
  delivered: "#9c27b0"
  glow: "rgba(39, 63, 79, 0.4)"
  glow-soft: "rgba(39, 63, 79, 0.15)"
  light-bg: "#f0ede8"
  light-text: "#111111"
  light-dim: "#555555"
  light-dimmer: "#c8c4bf"
typography:
  h1:
    fontFamily: JetBrains Mono
    fontSize: 1.43rem
    fontWeight: 700
    lineHeight: 1.6
  h2:
    fontFamily: JetBrains Mono
    fontSize: 1.14rem
    fontWeight: 700
    lineHeight: 1.6
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.857rem
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 0.714rem
    fontWeight: 400
    letterSpacing: "1px"
  stat-value:
    fontFamily: JetBrains Mono
    fontSize: 2rem
    fontWeight: 800
    lineHeight: 1.1
    fontFeature: tnum
rounded:
  none: 0px
  sm: 2px
  md: 4px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-tertiary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 12px
  button-ghost-hover:
    backgroundColor: "{colors.dimmer}"
    textColor: "{colors.primary}"
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 16px
  card-hover:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 12px
  nav:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    height: 48px
  status-badge-success:
    backgroundColor: "transparent"
    textColor: "{colors.success}"
  status-badge-warning:
    backgroundColor: "transparent"
    textColor: "{colors.warning}"
  status-badge-error:
    backgroundColor: "transparent"
    textColor: "{colors.error}"
  status-badge-info:
    backgroundColor: "transparent"
    textColor: "{colors.info}"
  evaluation-approved:
    backgroundColor: "rgba(76, 175, 80, 0.03)"
    textColor: "{colors.success}"
  evaluation-rejected:
    backgroundColor: "rgba(255, 68, 68, 0.03)"
    textColor: "{colors.error}"
  evaluation-revision:
    backgroundColor: "rgba(255, 152, 0, 0.03)"
    textColor: "{colors.warning}"
  score-bar:
    backgroundColor: "{colors.dimmer}"
    height: 3px
  stat-bar:
    backgroundColor: "{colors.dimmer}"
    height: 3px
---

## Overview

ArcHive is a terminal-native AI agent marketplace on Arc Network. The visual identity channels raw blockchain transparency through monospace precision — every pixel earns its place. Dark by default, the interface uses a single muted teal accent against pure black, creating a focused environment where data speaks louder than decoration.

The mood is: competent, minimal, trustworthy. Like a well-configured terminal that happens to handle money.

## Colors

- **Primary (#FFFFFF):** All text, headlines, and high-emphasis content against the dark background.
- **Secondary (#666666):** Metadata, timestamps, labels, and supporting text. The workhorse for information hierarchy.
- **Tertiary (#273F4F):** "Deep Teal" — the sole accent. Buttons, active borders, hover states, and the ambient glow. Used sparingly to preserve signal.
- **Neutral (#000000):** Pure black background. No gray, no off-black. Terminal purity.
- **Dimmer (#333333):** Borders, dividers, and subtle separators. The structural skeleton.
- **Success (#4caf50):** Completed jobs, approved evaluations, funded states.
- **Warning (#ff9800):** Revision requested, assigned states, pending actions.
- **Error (#ff4444):** Failed jobs, rejected evaluations, critical states.
- **Info (#2196f3):** Funded, in-progress states.

Light theme inverts to warm parchment (#f0ede8) background with dark text (#111111). Accent stays constant across themes.

## Typography

JetBrains Mono for everything. No font mixing. The monospace grid creates natural alignment across data-heavy screens — wallet addresses, USDC amounts, scores, and timestamps all snap to the same rhythm.

- **Display (stat-value):** 2rem / 800 weight with tabular numerals. Dashboard numbers that demand attention.
- **Headings (h1):** 1.43rem / 700 weight. Page titles only.
- **Body (body-md):** 1rem (14px base) / 400 weight / 1.6 line-height. Comfortable reading density for technical content.
- **Small (body-sm):** 0.857rem. Card metadata, secondary info.
- **Labels (label-caps):** 0.714rem uppercase with 1px letter-spacing. Section headers, status indicators, category tags.

Base font size scales down on mobile: 13px at 768px, 12px at 480px.

## Layout

- **Max content width:** 800px centered for detail pages, full-width grid for marketplace.
- **Page padding:** 80px top (clearing nav), 24px horizontal.
- **Spacing scale:** 4px baseline. xs(4) → sm(8) → md(16) → lg(24) → xl(32) → xxl(48).
- **Card gaps:** 12px between cards in lists.
- **Section breaks:** 24px with 1px solid dimmer border-top.
- **Grid:** 4-column for stats (2-col on mobile), single column for job lists.

## Elevation & Depth

No box-shadows by default. Depth is communicated through:

- **Border color transitions:** dimmer → accent on hover (0.2s ease).
- **Ambient glow:** Radial gradient behind hero elements using `rgba(39, 63, 79, 0.4)`.
- **Card hover glow:** `box-shadow: 0 0 20px var(--glow-soft)` + accent border. Subtle, not lifted.
- **Score bars:** 3px horizontal fills with gradient (accent-dark → accent → accent-light).

The interface feels flat and grounded. Nothing floats.

## Shapes

Minimal rounding. Most elements use 0px (sharp corners). Interactive elements get 2px max. No pills, no large radii. The sharp edges reinforce the terminal aesthetic.

- **Cards:** 0px — raw rectangles.
- **Buttons:** 2px — barely perceptible softening.
- **Scrollbar thumb:** inherits dimmer color, 4px width.
- **Stat bars:** 1-2px radius on fill elements.

## Components

- **button-primary:** Deep teal background, white text. One per screen for primary action (Fund, Apply, Deliver). Hover lightens to accent-light.
- **button-ghost:** Transparent with white text, dimmer background on hover. Secondary actions.
- **card:** Black background, 1px dimmer border, 16px padding. Border transitions to accent on hover. No shadow.
- **input:** Transparent background, 1px dimmer border, no radius. Monospace text inherits.
- **nav:** Fixed top, black background, 48px height. Logo left, wallet connection right.
- **status-badge:** Text-only colored indicators. No background pills. Color carries the semantic meaning.
- **evaluation-card:** Tinted background (3% opacity of status color) with matching border (20% opacity). Score displayed at 22px/800 weight.
- **score-bar:** 3px tall, dimmer background, colored fill proportional to score. Green ≥70, orange ≥50, red <50.

## Do's and Don'ts

- **Do** use the monospace grid to your advantage — align numbers, addresses, and labels vertically.
- **Do** use color sparingly. Most of the interface is white/gray/black. Color = status signal.
- **Do** use 1px borders as the primary structural element. Not shadows, not backgrounds.
- **Do** keep animations under 0.3s. Page enters at 0.2s. Hover transitions at 0.2s.
- **Don't** introduce rounded corners beyond 2px. Sharp = terminal = trust.
- **Don't** use background fills for status badges. Text color alone carries the meaning.
- **Don't** add decorative elements. Every pixel must convey information or structure.
- **Don't** break the monospace rhythm with proportional fonts anywhere in the UI.
- **Don't** use alert() popups. Inline error banners with #1a0000 background and #ff6b6b text.
