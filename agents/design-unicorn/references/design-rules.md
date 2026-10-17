# Standing design rules

Defaults the designer follows unless the project's own docs say otherwise.

The reviewer holds every screen to them too: a miss is at least 🟠. When a project's `PRODUCT.md`,
`DESIGN.md`, `CLAUDE.md` or `project-management/` docs say something different, the project wins.

## Layout and hierarchy

- **Text is text.** Titles, addresses and labels never sit in a pill or a button-shaped background.
  Only things you can tap look tappable. Use the platform's own title treatment.
- **Calm over busy.** When a header or card holds many items, simplify the hierarchy before adding
  anything. One bold number where the screen has one number that matters.
- **One spacing scale**, the same everywhere: section gaps, paddings and margins come from the
  spacing tokens, never by eye.
- **No generic kit.** No stock SaaS card grid, no decorative dividers, no decorative gradients, no
  motion for its own sake.
- **Show what is hidden.** A horizontal strip shows its count or a peek of the next item so people
  know it scrolls.
- **Long lists open in one place.** "Search" and "show all" are one control that opens one sheet
  (or page, on the web) that searches and scrolls everything, not a field plus a separate button.
- **Long titles truncate** before they reach the header's buttons.
- **The main action stays reachable.** It sits at the bottom of the screen or sheet, full width on
  phones, with secondary info (such as a version number) under it. On a long screen it floats
  rather than scrolling out of reach.
- **Status and retry messages are centred.**
- **A thing has one colour.** A status, category or person keeps the same colour on every screen.
- **Helper text is true** for what is shown. Never a hint that does not apply to the current state.

## Platform

- **Native navigation.** Headers, nav bars, sheet headers and Back / Close / Next / Delete use the
  platform's own layout, metrics and placement. A screen's actions sit on its header line.
- **Headers sit over content the platform's way**: the iOS bar material, Material 3's tonal
  elevation on scroll, a solid or translucent bar on the web.
- **Overlaid controls look native** (map buttons, floating actions) and hide while a sheet covers
  them.
- **Say what comes next.** Before any system permission prompt (location, camera, photos,
  notifications), show a picture of that platform's prompt with the choice to pick highlighted, and
  one plain line on what happens after. Nobody meets a system choice cold.
- **Touch targets** are at least 44 pt on iOS, 48 dp on Android, 24 px (44 px preferred for primary
  actions) on the web.
- **Casing** follows the platform: title case for iOS buttons and titles, sentence case for
  Material and most web UI, unless the project's docs pick one.

## Colour, type and states

- **Every colour and text style is a token.** No hex on a screen, no local text style. When the
  project has a dark mode, every colour token has a dark value, so dark mode comes from the tokens
  and dark screens do not need to be drawn.
- **Contrast** at least 4.5:1 for body text and 3:1 for large text and icons, in every mode,
  computed from the token values, not eyeballed.
- **Every screen has its states**: default with realistic demo content (never real customer data),
  empty, loading and error, plus any the task adds (saving, saved, offline, no permission).

## Motion

- Only motion that explains something: where a thing came from, where it went, that a tap landed.
- Press feedback is immediate. Small transitions run 200 to 300 ms; gesture-driven sheets use
  springs. Every animation can be interrupted and respects the reduced-motion setting.
- Transitions are the platform's own: a push slides in from the trailing edge, sheets rise from the
  bottom over a dimmed background, tab switches are instant.
- Motion is written as a note for the engineer, not drawn as decoration.

## Prototypes and notes

- **A prototype acts like the device.** Frames at the target device size, content scrolling inside,
  headers and status bar fixed at the top, tab bar and bottom buttons pinned above the safe area.
  Sheets show a grabber and close by Close, grabber or tapping outside. Back goes back and keeps the
  previous screen's scroll position; new screens open at the top.
- **Notes are for developers**, placed directly under the frame they describe: what the screen is
  for, its states, what each tap does, which component and which token. Never an agent name, a
  station or a task id.
- **Name layers and files by what they are** (`Label`, `Trailing value`), never `Frame 231`.

## Proof

- **Use the skills to the letter.** Record under `## Design › Skills used` which skills you invoked
  and what each one changed, and cite the platform guideline (HIG, Material 3, WCAG) behind each
  decision. The reviewer checks this section.
