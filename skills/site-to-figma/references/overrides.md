# overrides.json

The user's changes at the review stop go into `<site dir>/overrides.json`. Then `synth.zsh` runs again and every output (`tokens.json`, `figma-spec.json`, `review.md`) follows them. Never hand-edit the generated files: the next run would undo it. Keep the file between runs, because it is part of the site's design system.

All keys are optional:

```json
{
  "merge": { "#fafafb": "#fafafa" },
  "drop": ["#ff00ff"],
  "names": { "#5e6ad2": "indigo/500" },
  "roles": {
    "brand/primary": "#5e6ad2",
    "surface/card": { "light": "#ffffff", "dark": "#111111" }
  },
  "fonts": { "Söhne": "Inter Tight" },
  "typeNames": { "display/xl-medium": "display/hero" }
}
```

| Key | What it does | Typical request |
|---|---|---|
| `merge` | Treats the first colour as the second before anything else happens. | "Those two greys are the same." |
| `drop` | Leaves the colours out entirely. | "That pink is from an ad, ignore it." |
| `names` | Gives a colour a fixed primitive name instead of `<hue>/<step>`. | "Call the brand colour brand/500." |
| `roles` | Sets a colour meaning. A plain colour applies to both themes; `{light, dark}` sets each. A name not in the default list (`surface/inverse`, `text/success`) adds a new meaning. | "The brand colour is the indigo, not the button grey." |
| `fonts` | The Figma font to use for a site font. It is tried first, before the automatic stand-ins. | "Use Inter Tight for Söhne." |
| `typeNames` | Renames a text style. Use the generated name as the key. | "Call the 64px one display/hero." |

Colours are `#rrggbb` or `#rrggbbaa`, lowercase or uppercase. A colour given in `roles` that the site doesn't use is added to the palette. `names` only renames colours the site uses.

Things overrides can't do: they can't add a component the site doesn't have, or change component variants. Edit those in Figma after the build. Components that already exist are never rebuilt, so the edits are kept.
