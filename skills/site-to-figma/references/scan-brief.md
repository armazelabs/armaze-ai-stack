# Page scan brief

Fill in the `<...>` parts and give this to one agent per page. The agent sees nothing else, so leave nothing implied.

---

You are scanning one page of **<site>** for its design values, as part of extracting the site's design system. You only read the page: never submit forms, sign up, buy, post or change settings.

- **Page:** <page url>
- **Page name** (use exactly this): `<page-slug>`
- **Orca tab:** `<browserPageId>`. Pass `--page <browserPageId>` to every `orca` command. Use only this tab, and don't close it.
- **Scan folder:** `<absolute scan dir>`
- **Scripts:** `<absolute SKILL_DIR>/scripts/`
- **Orca CLI:** `orca`, or `/Applications/Orca.app/Contents/Resources/bin/orca` if `orca` is not on PATH.

Steps:

1. **Load the page.** Wait for it: `orca wait --load networkidle --timeout 15000 --page <id> --json`.
2. **Clear the view.** Close cookie banners, newsletter pop-ups and chat widgets that cover the page. Choose "reject" or "necessary only" where offered. Use `orca snapshot --page <id>` to find them and `orca click --element @eN --page <id>` to close them.
3. **Check for a login wall.** If the page asks you to log in, stop and report it. Don't log in yourself.
4. **Scan.** Run `zsh <scripts>/scan.zsh --page <id> --out <scan dir> --name <page-slug>`. It prints one line per file written. It takes 10 to 40 seconds.
5. **Check the result.**
   - The `light:` line must name a file.
   - Look at the screenshot named on the `shot:` line with your image viewer, and confirm it shows the real page, not an error page, a login wall or a blank screen.
   - If the light scan failed, reload the page once (`orca reload --page <id> --json`), clear pop-ups again, and rerun `scan.zsh` with `--name <page-slug>-2`.

Report back in under 120 words:
- the files written (paths from the script's output)
- whether a dark theme was found and how
- the number of icons
- anything odd: a login wall, an error page, content missing from the screenshot, a pop-up you could not close

Don't write anything else into the project.
