# MessApp Design System

The authoritative reference for MessApp's visual language. `src/style/index.css`
is the implementation; this document is the intent behind it. Where the two
disagree, one of them is a bug — fix it, don't work around it.

There is no `tailwind.config.js` and no `postcss.config.js`. Tailwind v4 runs
through the `@tailwindcss/vite` plugin, so the design tokens live in an
`@theme` block plus CSS custom properties in `src/style/index.css`. Add or
change colors there.

---

## 1. Palette

MessApp is **black and blue**. One accent hue, one neutral ramp in the same
hue family, no secondary accent, no gradients as decoration.

### Dark (default)

The ground is true `#000000`. This is deliberate: on OLED panels a black pixel
is an off pixel, and the app is used at night on phones. Depth comes from
*tonal elevation* — a higher `--surface-container-*` step — never from a shadow
or a glow.

| Token | Value | Role |
|---|---|---|
| `--bg-deep` | `#000000` | Behind everything |
| `--bg-base` | `#000000` | App ground |
| `--bg-surface` | `#08090c` | Panels sitting on the ground |
| `--bg-top` | `#000000` | Top/bottom chrome |
| `--bg-element` | `#101218` | Buttons, rows, inputs |
| `--bg-element-hover` | `#171a22` | Same, hovered |
| `--border-subtle` | `#20242e` | Default hairline |
| `--border-hover` | `#2e3440` | Hairline under pointer |
| `--text-main` | `#eef0f4` | Body and headings |
| `--text-muted` | `#838b9a` | Secondary text, labels |
| `--text-subtle` | `rgba(238,240,244,.6)` | Tertiary, timestamps |
| `--app-accent` | `#3b82f6` | The blue |
| `--accent-bright` | `#60a5fa` | Accent hover/active |
| `--accent-contrast` | `#ffffff` | Foreground **on** accent fills |
| `--app-accent-10/20/50` | `#3b82f6` at `1a`/`33`/`80` | Accent washes |
| `--border-accent` | `#1e40af` | Accent-tinted hairline |
| `--surface-container-low` | `#050507` | M3 elevation −1 |
| `--surface-container` | `#0c0e12` | M3 elevation 0 |
| `--surface-container-high` | `#14161d` | M3 elevation +1 |
| `--surface-container-highest` | `#1c1f28` | M3 elevation +2 |
| `--state-hover` | `#12141a` | State layer, hover |
| `--state-pressed` | `#1c1f28` | State layer, pressed |
| `--shadow-premium` | `0 8px 24px rgba(0,0,0,.6)` | Overlays only — see §4 |

**`--accent-contrast` is not decoration.** `#3b82f6` is a mid-tone, so anything
filled with the accent carries **white** text. Never hardcode a foreground on an
accent surface; read the token. A tint can move the accent to the top of the
ramp (see below), at which point the same token silently becomes dark — that is
the whole point of it existing.

**Black means black.** Dark mode is the OLED mode, not a dark-gray mode. Any
surface large enough to read as a panel — a card, a settings row group, a list
container, the bottom bar, a floating action button, a full-screen modal — sits
on `#000000` and is separated by a 1px `--border-subtle` hairline, not by a
lighter fill. If a container looks gray next to the app ground, that is a bug.

Where the tonal steps still apply:

- **Transient feedback** — hover, press, focus, drag. `--state-hover` and
  `--bg-element-hover` exist for the moment a finger or pointer is on the
  element, and go back to black when it leaves.
- **Small inline chrome** — an input field, a badge, a skeleton placeholder, an
  avatar backplate. Too small for the fill to read as a panel.
- **Selection state**, which is an accent wash (`--app-accent-10/20`) or an
  accent ring, never a neutral gray step.

The tint palettes follow the same rule: a tint moves the accent and the small
inline chrome, never the ground. `--bg-base` is `#000000` under every tint.

### Light

Not an afterthought and not the dark palette inverted mechanically: cool paper
in value steps, with the accent darkened so it clears AA on white. OLED
reasoning does not apply here — paper is paper.

| Token | Value |
|---|---|
| `--bg-base` | `#fbfcfe` |
| `--bg-surface` | `#ffffff` |
| `--bg-element` | `#f1f4f9` |
| `--border-subtle` | `#d8dee8` |
| `--text-main` | `#1b1f27` |
| `--text-muted` | `#5c6472` (5.81:1 on `--bg-base`) |
| `--app-accent` | `#2563eb` |
| `--accent-bright` | `#1d4ed8` |
| `--accent-contrast` | `#ffffff` |

### Tints

`data-surface-tint` shifts the elevated surfaces and the accent while leaving
`--bg-base` at `#000000`. Three options, all in the blue family:

- **Ink** (`neutral`, default) — the palette above.
- **Ocean** — deeper blue surfaces, cyan `#38bdf8` accent. Cyan sits at the top
  of the ramp, so this tint sets `--accent-contrast: #04121c`.
- **Steel** — near-neutral cool surfaces, indigo `#818cf8` accent.

Tints override `--app-accent`; `--accent` chains off it, so setting one name
reaches every consumer of either. Retiring a tint is safe:
`normalizeSurfaceTint` falls back to `neutral` for any unknown persisted value.

### The Tailwind ramp

`--color-gray-*` in the `@theme` block is a **cool** ramp held at ~222°, the same
family as the accent. It exists because ~600 `text-gray-*` / `bg-gray-*` utility
classes are already in the components. `--color-indigo-*`, `--color-violet-*`
and `--color-sky-*` are remapped onto blues for the same reason — roughly 37
hardcoded utility classes bypass the token layer. Both remappings are
compatibility shims, not part of the design. Prefer `var(--text-muted)` over
`text-gray-400` in new code, and retire the shims as those call sites are
rewritten.

---

## 2. Type

Two self-hosted families, no webfont CDN:

- **Fraunces** — `--font-display`, utility `font-display`. Headings, the
  `messapp` wordmark, conversation titles. It has real optical character; use
  it where a name is being stated, not for UI labels. There is no
  `font-headline` alias — one family, one token name.
- **Nunito** — `--font-sans`. Everything else: body, messages, controls, labels.

Both stacks fall back inside their own genre — Fraunces to `ui-serif`, Nunito
to `ui-sans-serif` — so a swap during load reflows rather than switching genre.

The two families want opposite defaults, so `index.css` sets each once instead
of per call site: `.font-display` gets `font-optical-sizing: auto`, `-0.02em`
tracking and `1.18` leading, while Nunito body copy keeps the wider default
leading and takes `text-wrap: pretty`. A `tracking-*` or `leading-*` utility on
the element still wins, so existing per-place overrides are unaffected.

Digits that sit in a fixed slot — message timestamps, the notification badge —
carry `tabular-nums` so they stop reflowing as the value changes.

Message body size is user-adjustable through `--chat-message-font-size`. Never
hardcode a message font size.

The wordmark is lowercase `messapp`, Fraunces, `font-extrabold`, tracking
`-0.045em`. It is always `--text-main` — never a gradient, never accent-colored.

---

## 3. Material You, as applied here

- **Elevation is a hairline, not a fill.** Do not reach for a shadow to express
  hierarchy — on `#000000` a shadow is invisible anyway. In dark mode a panel is
  separated by `--border-subtle` (see "Black means black" in §1); the
  `--surface-container-*` scale is for light mode, transient state, and the
  small inline chrome that rule carves out.
- **State layers**: hover `0.08`, pressed `0.12` (`--m3-state-hover`,
  `--m3-state-pressed`), or the pre-mixed `--state-hover` / `--state-pressed`.
- **Motion**: `--m3-standard` `cubic-bezier(.2,0,0,1)` for most transitions,
  `--m3-emphasized` `cubic-bezier(.05,.7,.1,1)` for entrances. Durations
  `--m3-short` 200ms / `--m3-medium` 350ms. Nothing animates longer than 350ms
  on a user-initiated action.
- **Shape**: the M3 scale is mapped onto Tailwind's radius names so existing
  `rounded-*` utilities land on it — `sm` 4px, `md` 8px, `lg` 12px, `xl` 16px,
  `2xl` 28px. Rows and cards are `2xl`; pills are `rounded-full`.
- **Press feedback**: `active:scale-95` on primary buttons — a press you can
  feel, not an imperceptible 0.98.

---

## 4. No glow

**Rule: nothing in this app blooms.** No accent-colored `box-shadow` halos, no
`filter: blur()` used as ambient decoration, no `text-shadow`, no
`drop-shadow()`.

What is still allowed, and only this:

- `--shadow-premium` on overlays — modals, popovers, sheets. Its only job is to
  lift a surface off the content behind it, and it is neutral black, never
  tinted.
- Solid rings: `box-shadow: 0 0 0 Npx <color>` with no blur radius. This is how
  focus and selection are drawn.
- Neutral drop shadows on cards in **light** mode, where there is actually light
  to cast them.

**Accessibility carve-out:** removing a glow must never remove a state. Focus is
drawn with a solid 2px ring against a 2px `--bg-base` gap, and the voice
"speaking" indicator is a ring that thickens rather than a halo that blooms. If
stripping a glow leaves a state invisible, replace it with a border — do not
just delete it.

---

## 5. Navigation

**One bottom bar is the app's only navigation surface.** There is no left
sidebar, on any breakpoint. Five slots, in this order, left to right:

| Slot | Owns |
|---|---|
| ☰ **Menu** | Profile, presence status, all settings, sign out. A tab like the rest, not a sheet. |
| 🔔 **Notifications** | Friend requests. Carries the only badge in the app. Unread conversations belong to Chats, which already signals them with a dot and a weight change. |
| ➕ **Add** | Add-friend by tag, plus the full friends list. |
| ⊞ **Servers** | Servers and group chats, drilling into channels. |
| 💬 **Chats** | Direct message rooms, with unread state. |

Rules:

- One active style for every tab: accent fill, `--accent-contrast` foreground.
  Tabs do not get individual hues — four unrelated colors in one bar reads as
  four unrelated apps.
- The bar is hidden inside an open conversation; a back arrow in the top bar
  exits to the owning tab.
- The top bar shows the `messapp` wordmark when no conversation is open, and the
  conversation's identity when one is.
- Only one badge exists in the app, on Notifications. If something else needs a
  badge, it probably needs to be a notification instead.
- A screen may **dock its own action bar** directly above the bottom bar — the
  server-detail header and the friend-search input both do. A docked bar is
  `sticky bottom-0` inside the scroll region, opaque `--bg-base`, separated by a
  `--border-subtle` hairline (§3), and content scrolls behind it. The
  quick-actions FAB does not hide on those screens: the bar reserves `4.5rem`
  of right padding and the FAB is rendered inside the bar, centered in that slot
  (`bottom: calc(50% - 1.75rem)`, which centers the trigger while the action list
  still grows upward). At most one docked bar per screen; if a screen wants two,
  one of them is not a primary action.

---

## 6. Accessibility floors

Non-negotiable, and cheaper to hold than to retrofit:

- **Contrast**: 4.5:1 for body text, 3:1 for large text and meaningful icons.
  `--text-muted` is tuned to the floor in both themes and is the lowest-contrast
  text token — anything dimmer than it is a bug.
  - `#3b82f6` on `#000000` — 5.71:1 ✓
  - `#ffffff` on `#3b82f6` — 3.68:1 ✓ at the large-text/UI-component floor;
    accent fills carry short bold labels and icons, not body copy.
  - `#2563eb` on `#ffffff` — 5.17:1 ✓
- **Touch targets**: 44px minimum. `min-h-11` already encodes this; use it.
- **Focus is always visible.** Every interactive element has a
  `focus-visible` ring. See §4 — this is the one place shadows survived.
- **Safe areas**: bottom chrome pads with `env(safe-area-inset-bottom)`. The app
  ships to iOS, Android, and Tauri desktop from one build.
- **Color is never the only signal.** Unread is a dot *and* a weight change;
  presence is a shape *and* a color.
