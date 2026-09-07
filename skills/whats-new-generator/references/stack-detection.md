# Stack detection

How to identify a project's ecosystem without assuming it is a JavaScript web
app. Everything downstream - where the version lives, how state persists, what
"a page" means, what accessibility means - follows from this.

**Never assume `package.json` exists.** It is one manifest among many, and its
absence means a different ecosystem, not a broken project.

## 1. Find the manifest

Look for these at the root **and** one level down (an `app/`, `src/`, `client/`,
`frontend/`, `web/`, or `mobile/` subfolder is common - a repo may have no root
manifest at all, only `app/package.json` beside an `api/`):

| Manifest | Ecosystem | Version field |
| --- | --- | --- |
| `package.json` | Node / JS / TS | `"version"` |
| `pubspec.yaml` | Flutter / Dart | `version:` (`1.2.3+45`, build after `+`) |
| `Info.plist`, `*.xcodeproj`, `Package.swift` | iOS / macOS Swift | `CFBundleShortVersionString` |
| `build.gradle(.kts)`, `AndroidManifest.xml` | Android | `versionName` |
| `pyproject.toml`, `setup.py`, `setup.cfg` | Python | `[project] version` / `version=` |
| `go.mod` | Go | git tags (no version field) |
| `Cargo.toml` | Rust | `[package] version` |
| `Gemfile`, `*.gemspec` | Ruby | `spec.version` / `lib/**/version.rb` |
| `composer.json` | PHP | `"version"`, often absent -> git tags |
| `*.csproj`, `Directory.Build.props` | .NET | `<Version>` |
| `pom.xml`, `build.gradle` | Java / Kotlin JVM | `<version>` / `version =` |
| none of these | static site, docs, or polyglot repo | git tags |

### A root manifest is not automatically the right one

**Read the version from the manifest of the surface the changelog covers, not
from whatever sits highest in the tree.** In a workspace, the root manifest is
often a placeholder that no one bumps - and taking its version silently
proposes a wrong number (`0.0.1` for an app that is really on `0.7.0`).

Treat a root manifest as a placeholder, and look one level down instead, when
any of these hold:

- its version is `0.0.0`, `1.0.0` untouched since the first commit, or missing
- it declares workspaces (`workspaces`, `pnpm-workspace.yaml`, `packages/`,
  `[tool.uv.workspace]`, a Cargo `[workspace]`)
- it is marked private with no build of its own
- its version has never changed in git history while a child's has:
  `git log --oneline -- package.json` versus the child's

If both a root and a child manifest carry real, moving versions, **ask which
surface the changelog covers** rather than guessing - that is the same question
as section 4's monorepo scoping, so ask it once.

**No version anywhere -> use git tags** (`git describe --tags --abbrev=0`), and
if there are no tags either, fall back to date-only entries and say so.

This supersedes the `changelog-generator` skill's "read the version from
`package.json`" rule, which is correct only for the Node case. Take its intent -
read the project's real declared version - and read it from wherever this table
says it lives.

## 2. Identify the surface

What kind of thing is this? It decides whether phases (c), (d) and (e) apply at
all.

- **Web app** (Next, Remix, React Router, TanStack, Vue, Nuxt, SvelteKit,
  Angular, Rails, Django, Laravel, Phoenix) -> full scaffold: page, modal, nav.
- **Static site / marketing page** (Astro, Hugo, Jekyll, Eleventy, Gatsby, plain
  HTML) -> changelog **page** yes, linked from the **footer** (phase e), not the
  top nav; **modal usually no** - visitors are anonymous and mostly first-time,
  so a "what's new since your last visit" popup has no last visit to compare
  against. Ask before building one.
- **Mobile app** (React Native, Expo, Flutter, native Swift/Kotlin) -> screen +
  modal, using that platform's own navigation and storage (sections 3-4). Store
  release notes are a **separate** artifact - see `newsletter-format.md`.
- **Desktop app** (Electron, Tauri, native) -> treat as a web app if the UI is
  web-based, else as native.
- **CLI, library, service, or API with no UI** -> **no page, no modal, no nav.**
  Skip phases (c), (d), (e) entirely and maintain a root `CHANGELOG.md` via the
  `changelog-generator` skill. Say plainly in the report that you skipped them
  and why; don't invent a UI to scaffold into.

## 3. Where the "seen version" is remembered

The modal needs to answer "has this person already seen version X?" **Where that
answer lives depends on whether there is a user to attach it to** - and the
default is the user, not the device.

**If the project has auth: store it on the user record.** A
`last_seen_changelog_version` column (or field, or preference row) is the right
home. It follows the person across devices and browsers, survives a cleared
cache or a reinstall, and is queryable - you can actually tell how many people
saw an announcement. Check for auth in phase (a): a users/accounts table, a
session or auth middleware, a current-user hook or provider.

**Only if there is no user - a marketing site, a local-only app, a
pre-login screen - fall back to device storage:**

| Platform | API |
| --- | --- |
| Web | `localStorage` |
| React Native / Expo | `@react-native-async-storage/async-storage`, or MMKV / `expo-secure-store` if already a dependency |
| Flutter | `shared_preferences` |
| iOS native | `UserDefaults` |
| Android native | `SharedPreferences` or DataStore |
| Electron / Tauri | renderer `localStorage`, or the app's own config store |

Be honest about what device storage costs: it is **per device and per browser**,
so a second device, a private window, or cleared app data all read as "never
seen it," and none of it is visible to you.

Whichever it is, the rules are constant: **namespace the key**
(`<project-slug>:changelog:last-seen-version`), wrap read *and* write in the
platform's error handling, and **fail open** - if the value can't be read, show
the modal rather than silently suppressing it. Device APIs outside the web are
mostly async, as is any server read, so handle the pending state without
flashing the modal.

## 4. Monorepo scoping

If the repo holds more than one deployable surface (wingman's `app/` + `api/`,
or a `packages/*` workspace):

- **Ask which paths the changelog covers.** A backend commit can be entirely
  real and still irrelevant to an app's changelog.
- Scope every history read to those paths: `git log -- app/ packages/ui/`.
- Ask whether one shared changelog or one per surface. Per-surface means a
  separate watermark, version and entries collection for each - and the
  one-entry-per-day rule in `entry-rules.md` then applies **per collection**,
  not across the repo.
