# Stack skills

The skills `/unicorn setup` installs for the crew. Take the core set, then
every row whose condition matches the profile. Members use a skill when it is
there and skip it when it is not.

## Core (always)

| Name | Who leans on it |
|---|---|
| `grilling` | the director, at intake |
| `impeccable` | the designer; the reviewer (audit, critique) |
| `frontend-design` | the designer |
| `better-ui` | the designer, the reviewer, the engineer |
| `emil-design-eng` | the designer, the engineer (motion) |

## By stack

| When the profile says | Add |
|---|---|
| `kind: web` and the work is marketing or landing pages | `design-taste-frontend` |
| `framework: expo` or `react-native` | `expo-animation`, `expo-native-ui` |

## By design tool

| When the profile says | Add |
|---|---|
| `tool: figma` | `figma` |

## Notes

- `impeccable`, `frontend-design` and `figma` are Claude Code plugins on the
  shelf, not skill folders. `aistack` installs them the same way; with
  `--global` they go in at user scope.
- `time-tracker` and `unicorn` come with the design-unicorn bundle already.
  Don't list them here.
- Before installing, drop every name `aistack list --names` doesn't show
  (it prints `skills/<name>` and `plugins/<name>`).
- When the shelf gains skills for other stacks (Flutter, Swift, Next.js...),
  add a row here.
