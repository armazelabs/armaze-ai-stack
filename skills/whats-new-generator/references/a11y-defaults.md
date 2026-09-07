# Generic modal accessibility defaults

These are the floor for the "what's new" modal when the target project has
**no existing dialog/modal primitive to reuse** and this skill has to build
one from scratch. They are sensible defaults for any project, not a
specific ruleset - if the target project already carries its own
accessibility bar (a `CLAUDE.md`, an `A11Y.md`, a documented rule set,
whatever form it takes), that project's own rules win and these are the
fallback, not an override.

If an existing dialog/modal primitive was found, use it and its own
accessibility behaviour instead of any of this - read its real prop API
from source first, since dialog primitives across ecosystems (Radix,
Headless UI, MUI, Chakra, a Vue or Svelte equivalent) do not share a shape
with each other.

## Non-web platforms

The checklist below is DOM-shaped. On another platform, meet the same intent
through that platform's own accessibility model rather than transliterating
attributes that do not exist there:

| Intent | Web | React Native | Flutter | SwiftUI | Compose |
| --- | --- | --- | --- | --- | --- |
| Announce as a modal | `role="dialog"` + `aria-modal` | `accessibilityViewIsModal` | `Semantics(scopesRoute:)` | `.sheet` / `.accessibilityAddTraits(.isModal)` | `Dialog` + `semantics { paneTitle }` |
| Name it | `aria-labelledby` | `accessibilityLabel` | `Semantics(label:)` | `.accessibilityLabel` | `contentDescription` |
| Move focus in | focus the dialog | `setAccessibilityFocus` | `FocusScope` | `@AccessibilityFocusState` | `FocusRequester` |
| Dismiss | Escape | hardware back | `WillPopScope` | swipe / dismiss | back handler |
| Trap focus | focus trap | modal view flag | route scoping | automatic in `.sheet` | automatic in `Dialog` |

The platform's own dialog primitive usually satisfies most of these already -
which is another reason to reuse one rather than build from scratch.

## Building one from scratch

- **Keyboard operable end to end.** No control reachable only by pointer.
- **Focus moves into the dialog on open** and is **trapped** inside it
  while open - Tab and Shift+Tab cycle only through the dialog's own
  focusable elements, never escaping to the page behind it.
- **Escape closes it.**
- **Focus returns** to whatever element had focus before the dialog opened
  (or the element that triggered it), on close.
- **`role="dialog"` and `aria-modal="true"`**, labelled by the dialog's own
  visible title (`aria-labelledby`, pointing at the title element - never a
  duplicate invisible label repeating visible text) and described by its
  body content where that adds information beyond the title
  (`aria-describedby`).
- **The background is inert** while the dialog is open - a screen reader
  or keyboard user should not be able to reach content behind the dialog
  at all, not just visually obscured content.
- **Visible focus indicator** on every interactive element inside, at
  least 2px with 3:1 contrast against its background - never suppressed
  without a replacement.
- **Respect `prefers-reduced-motion`.** No open/close transition (or a
  near-instant one) for a reader who has that set - test this by actually
  checking the media query, not by assuming a fade is "subtle enough."
  motion always draws it as already open/closed.
- **Prefer the native `<dialog>` element** where the target's own browser
  support target allows it - it gives focus containment and a documented
  interaction model largely for free, and is simpler to keep correct than
  a hand-rolled implementation.
- **Never convey state by colour alone.** If the modal has any status
  affordance (a "new" indicator, a category grouping), pair colour with an
  icon or text label, not colour on its own.
- **Minimum 12px text, minimum 24x24px interactive targets** (44x44px is
  the better target where the layout allows it), with at least 8px between
  adjacent targets.
- **Explicit, visible labels on every control** - never a placeholder
  standing in as the only label, and never an icon-only close button
  without an accessible name.

## What NOT to do

- Do not use `outline: none` (or the equivalent in the target's styling
  approach) without painting a visible replacement focus ring.
- Do not use a `title` attribute as a substitute for a real tooltip or
  accessible name - it is invisible to keyboard users, appears only after
  a delay, and some screen readers announce it twice alongside the real
  name.
- Do not build the trigger or close control as a clickable `div`/`span` -
  use a real `<button>`.
- Do not claim a screen-reader test was performed. If manual verification
  matters for this project, say so and ask a human to actually run one -
  never assert it happened.
