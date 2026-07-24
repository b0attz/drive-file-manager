---
name: Google Drive File Manager
description: Lightweight, self-hosted Google Drive file management interface
colors:
  primary: "#1A3A5C"
  primary-hover: "#0F2A40"
  primary-light: "#E8EDF3"
  accent: "#C7452B"
  accent-hover: "#A83820"
  danger: "#B33A2E"
  bg: "#FFFFFF"
  bg-secondary: "#F4F5F7"
  bg-hover: "#ECEEF1"
  text: "#1A1A2E"
  text-secondary: "#3D3D4E"
  text-muted: "#6B6B7B"
  border: "#D8DCE2"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Noto Sans Thai, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Noto Sans Thai, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Noto Sans Thai, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
---

# Design System: Google Drive File Manager

## 1. Overview

**Creative North Star: "The Clear Desk"**

A tool that organizes your files with the calm precision of a well-kept desk. Every element earns its place. The system rejects visual noise: no decorative gradients, no side-stripe borders, no ornamental flourishes. Depth comes from tonal layering and subtle shadows, not from color spectacle.

**Key Characteristics:**
- Flat surfaces with minimal elevation
- Typography-driven hierarchy (weight and size, not color)
- Neutral palette with one authoritative primary and one functional accent
- Keyboard-first interaction with visible focus states

## 2. Colors

The palette is restrained: a deep navy primary carries authority, a terracotta accent marks action, and a range of cool grays handles everything else.

### Primary
- **Deep Ink Navy** (#1A3A5C): Primary buttons, active states, breadcrumb links, focus rings. Used sparingly, carries the interface's authority.
- **Hover Navy** (#0F2A40): Button hover states, active press feedback.
- **Light Navy** (#E8EDF3): Breadcrumb hover backgrounds, subtle primary tints.

### Accent
- **Terracotta** (#C7452B): Upload button, accent actions. Functional, not decorative. Appears on ≤15% of any screen.
- **Hover Terracotta** (#A83820): Accent button hover state.

### Neutral
- **White** (#FFFFFF): Primary background, card surfaces, modal backgrounds.
- **Cool Gray** (#F4F5F7): Page background, secondary surfaces.
- **Hover Gray** (#ECEEF1): Hover states on interactive elements.
- **Ink** (#1A1A2E): Body text, primary headings. High contrast on white.
- **Secondary Ink** (#3D3D4E): Subtitles, secondary text, descriptions.
- **Muted Gray** (#6B6B7B): Metadata, timestamps, disabled states, placeholders.
- **Border Gray** (#D8DCE2): Card borders, input borders, dividers.

### Named Rules
**The Terracotta Rule.** The accent color appears only on interactive elements that perform an action (upload, share, delete). Never use it for decoration, backgrounds, or emphasis on static content.

## 3. Typography

**Display Font:** System stack (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Noto Sans Thai, sans-serif)
**Body Font:** Same system stack (weight variation only)

**Character:** One typeface, multiple weights. Hierarchy through weight contrast (400 vs 600), not family switching. The Noto Sans Thai fallback ensures Thai script renders cleanly alongside Latin text.

### Hierarchy
- **Display** (600 weight, 22px, -0.01em tracking): Login card heading, modal titles. Reserved for moments that demand attention.
- **Title** (600 weight, 18px): App header. Anchors the interface.
- **Body** (400 weight, 13px): File names, button labels, form inputs. The working text.
- **Label** (500 weight, 13px): Search input, section labels. Slightly heavier than body for scannability.
- **Meta** (400 weight, 11px, 0.01em tracking): File sizes, dates, timestamps. Lightest weight, smallest size.

### Named Rules
**The Weight Contrast Rule.** Hierarchy is built through font-weight jumps (400 to 600), not size alone. Every heading step must differ by at least 200 weight units.

## 4. Elevation

Flat by default. Shadows appear only on interaction: card hover, modal backdrop, toast notifications. No ambient decorative shadows.

### Shadow Vocabulary
- **Subtle** (`0 1px 2px rgba(0,0,0,0.06)`): Default card state, input focus. Barely perceptible.
- **Elevated** (`0 2px 8px rgba(0,0,0,0.1)`): Card hover, dropdown menus. Signals interactivity.
- **Modal** (`0 8px 32px rgba(0,0,0,0.16)`): Modal content, toast notifications. Commands attention.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, focus, modal open). If a shadow is always visible, it's too heavy.

## 5. Components

### Buttons
- **Shape:** Gently rounded (6px radius)
- **Primary:** Deep Ink Navy background, white text, 8px/16px padding
- **Outline:** White background, secondary text, border at border-gray
- **Ghost:** Transparent background, secondary text, no border
- **Hover:** Border darkens on outline buttons; background darkens on primary/ghost
- **Focus:** 2px primary ring with 2px offset

### Cards / File Grid
- **Corner Style:** 10px radius
- **Background:** White
- **Border:** 1px solid border-gray; transitions to primary on hover
- **Shadow:** Subtle at rest; elevated on hover
- **Internal Padding:** 16px
- **Typography:** 600 weight file name, 400 weight metadata

### Inputs / Fields
- **Style:** 1px border, white background, 6px radius, 13px text
- **Focus:** Border shifts to primary; subtle blue glow (box-shadow)
- **Padding:** 10px vertical, 14px horizontal

### Navigation (Breadcrumb)
- **Style:** Inline flex, 13px text
- **Links:** Primary color, 6px radius hover background
- **Current:** Secondary text, 600 weight (no link styling)

### Modals
- **Backdrop:** 40% black overlay
- **Content:** White, 10px radius, 24px padding, elevated shadow
- **Close button:** 18px, positioned top-right, secondary text color

## 6. Do's and Don'ts

### Do:
- **Do** use font-weight 600 for all headings and file names. Weight contrast is the hierarchy engine.
- **Do** keep the terracotta accent under 15% of any screen surface. Its rarity is the point.
- **Do** use subtle shadows (0 1px 2px) at rest, elevated shadows (0 2px 8px) on hover.
- **Do** maintain 4.5:1 contrast for all body text. The muted gray (#6B6B7B) is the floor.
- **Do** show focus rings (2px primary, 2px offset) on all interactive elements.

### Don't:
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent on cards, list items, or callouts. This is the most recognizable AI-generated UI tell.
- **Don't** use warm off-white backgrounds (#F5F0EB, #FAF7F2, #FEFCF8). These read as cream/sand/parchment and signal AI defaults. Use cool neutrals.
- **Don't** apply `background-clip: text` with gradients. Decorative text is never meaningful.
- **Don't** use glassmorphism (backdrop-filter blur) decoratively. Rare and purposeful, or nothing.
- **Don't** pair a 1px border with a box-shadow wider than 8px blur. Pick one, not both.
- **Don't** use border-radius greater than 16px on cards. Full-pill is fine for tags and buttons only.
