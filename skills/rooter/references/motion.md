# Motion

One interaction carries the whole page: **the row responds to being pointed at.**
Everything else is still. A Rooter is signage - it should feel crisp to move
through, never animated at.

Taken verbatim from the reference implementation (stg, `src/styles/chooser.css`).
Reuse these values rather than inventing new ones.

## The row hover

Three things move together on hover **and on `:focus-visible`**, so a keyboard
user sees exactly what a mouse user sees:

| What | From → to |
| --- | --- |
| Row background | transparent → `--wash` (a faint tint of the brand hue) |
| Row inline padding | `0` → `1rem` — the row insets, so it reads as lifting out of the list |
| Arrow | `translateX(0)` → `translateX(0.375rem)` |

**260ms ease, all three.** One duration for the whole gesture; the row and its
arrow must not arrive at different times.

```css
.row {
  /* Physical longhands here, NOT `padding-inline`. The value is set with the
     logical shorthand below, but a logical name in transition-property is not
     animated by every engine - and un-animated padding makes the row jump
     sideways instead of sliding. Name what actually changes. */
  transition:
    background-color 260ms ease,
    padding-left 260ms ease,
    padding-right 260ms ease;
}

.row:hover,
.row:focus-visible {
  background: var(--wash);
  padding-inline: 1rem;
}

.row .go {
  transition: transform 260ms ease;
}

.row:hover .go,
.row:focus-visible .go {
  transform: translateX(0.375rem);
}
```

That padding comment is not incidental. It is the bug this rule exists to
prevent, and it should survive into whatever project the Rooter is built in.

## Why these three and nothing else

- **The background** says *this row is the one you are on* - the target is the
  whole row, not the words in it.
- **The inset** gives the row somewhere to go. A background alone flashes; a
  background plus movement reads as a response.
- **The arrow** says which way this goes. It is the only element that hints at
  travel, which is why it moves furthest relative to its size.

No lift, no shadow, no scale, no colour change on the text. A row that pops
forward reads as a card in a product UI; this is a list of doors.

## Reduced motion

Non-negotiable, and it ships with the animation, not after it:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

The background and inset still apply - the row still shows what is focused.
Only the tweening goes.

## Everything else on the page

Still. No entrance animation on load, no staggered rows, no parallax, no
scroll-triggered reveal. The client opens this page to leave it; anything that
delays the list delays them.

The two exceptions, both functional:

- **Focus ring** appears instantly. Never transitioned - a focus ring that fades
  in is a focus ring that is briefly invisible.
- **The skip link** may slide into view on focus, at the same 260ms.

## Adapting to the project's motion system

If the target project has motion tokens, use its nearest duration and easing
rather than hardcoding `260ms ease` - the *gesture* is what this document
specifies, not the numbers. Keep all three properties on one duration, whatever
it is.
