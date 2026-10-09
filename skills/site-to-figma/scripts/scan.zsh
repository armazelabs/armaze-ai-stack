#!/usr/bin/env zsh
#
# scan.zsh - scan the page open in one Orca browser tab: its design values in the light
# theme, its logo and icons, a full-page screenshot, then the same again in the dark
# theme if the site has one. Writes into a scan folder and prints what it wrote.
#
#   zsh <skill>/scripts/scan.zsh --page <browserPageId> --out <scan dir> --name <page-slug> [--no-dark]
#
#   <scan dir>/raw/<page-slug>.light.json     design values (extract-styles.js)
#   <scan dir>/raw/<page-slug>.dark.json      the same in the dark theme, when there is one
#   <scan dir>/raw/<page-slug>.assets.json    logo and icons as SVG (extract-assets.js)
#   <scan dir>/screenshots/<page-slug>-light.jpg, <page-slug>-dark.jpg
#
# The dark theme is found by switching the tab's prefers-color-scheme and reloading;
# if the page looks the same and its CSS has .dark / [data-theme=dark] rules, those are
# switched on instead. The tab is put back to light when it is done. Existing files are
# never overwritten: use a new scan folder for a new run.

emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

readonly SELF=${0:A}
readonly DIR=${SELF:h}

fail() { print -r -u2 -- "scan: $*"; exit 1 }
note() { print -r -- "$*" }

orca_bin() {
  local o
  o=$(command -v orca 2>/dev/null) && { print -r -- $o; return }
  o=/Applications/Orca.app/Contents/Resources/bin/orca
  [[ -x $o ]] && { print -r -- $o; return }
  return 1
}

ORCA=
PAGE=

# run <orca args...> - an orca command against this scan's tab, output discarded
run() { $ORCA "$@" --page $PAGE --json >/dev/null 2>&1 }

# ev <js file> - evaluate a script in the tab and print its result
ev() { $ORCA eval --expression "$(<$1)" --page $PAGE 2>&1 }

settle() {
  run wait --load networkidle --timeout 15000 || run wait --timeout 3000
  ev $DIR/scroll.js >/dev/null
}

# extract <out file> - run extract-styles.js, keep the result only if it is real JSON from it
extract() {
  local res
  res=$(ev $DIR/extract-styles.js) || return 1
  [[ $res == '{"v":1,'* ]] || { print -r -u2 -- "scan: extract-styles failed: ${res[1,300]}"; return 1 }
  print -r -- $res > $1
}

sig_of() { grep -o '"sig":"[^"]*"' -- $1 | head -n 1 }

main() {
  local out= name= dark=1
  while (( $# )); do
    case $1 in
      --page) PAGE=${2:-}; shift 2 || fail "--page needs an id" ;;
      --out) out=${2:-}; shift 2 || fail "--out needs a folder" ;;
      --name) name=${2:-}; shift 2 || fail "--name needs a page slug" ;;
      --no-dark) dark=; shift ;;
      -h|--help) sed -n '3,17p' $SELF | sed 's/^# \{0,1\}//'; return 0 ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  [[ -n $PAGE ]] || fail "give --page <browserPageId> (from orca tab list --json)"
  [[ -n $out ]] || fail "give --out <scan dir>"
  [[ $name == [a-z0-9]##(-[a-z0-9]##)# ]] || fail "--name must be kebab-case (pricing, docs-intro), got: ${name:-nothing}"
  ORCA=$(orca_bin) || fail "the orca CLI was not found; open Orca, or put its bin/ on PATH"

  mkdir -p -- $out/raw $out/screenshots || fail "cannot create $out"
  out=${out:A}
  local light=$out/raw/$name.light.json darkf=$out/raw/$name.dark.json assets=$out/raw/$name.assets.json
  local f
  for f in $light $darkf $assets $out/screenshots/$name-light.jpg $out/screenshots/$name-dark.jpg; do
    [[ -e $f ]] && fail "already exists, not overwriting: $f (use a new scan folder)"
  done

  # light
  run set media --color-scheme light || fail "could not set the colour scheme (is tab $PAGE open?)"
  run reload
  settle
  extract $light || fail "could not read the page's styles"
  note "light: $light"

  local res
  res=$(ev $DIR/extract-assets.js)
  if [[ $res == '{"v":1,'* ]]; then
    print -r -- $res > $assets
    note "assets: $assets ($(grep -o '"name":"' $assets | wc -l | tr -d ' ') icons, logo: $(grep -o '"logo":{"kind":"[a-z]*"' $assets | sed 's/.*"\([a-z]*\)"$/\1/'))"
  else
    print -r -u2 -- "scan: extract-assets failed: ${res[1,300]}"
    note "assets: none"
  fi

  if zsh $DIR/shot.zsh $out/screenshots/$name-light.jpg --full --page $PAGE >/dev/null; then
    note "shot: $out/screenshots/$name-light.jpg"
  else
    note "shot: failed (light)"
  fi

  # dark
  if [[ -n $dark ]]; then
    local tmp=$out/raw/.$name.dark.$$.json how=
    run set media --color-scheme dark
    run reload
    settle
    if extract $tmp && [[ $(sig_of $tmp) != $(sig_of $light) ]]; then
      how=media
    elif ! grep -q '"darkSelectors":\[\]' $light; then
      rm -f -- $tmp
      $ORCA eval --page $PAGE --expression '(async () => { const h = document.documentElement; h.classList.remove("light", "light-theme"); h.classList.add("dark", "dark-theme"); for (const a of ["data-theme", "data-mode", "data-color-scheme", "data-bs-theme"]) h.setAttribute(a, "dark"); h.style.colorScheme = "dark"; if (document.body) document.body.classList.add("dark"); await new Promise((r) => setTimeout(r, 500)); return "ok"; })()' >/dev/null 2>&1
      extract $tmp && [[ $(sig_of $tmp) != $(sig_of $light) ]] && how=class
    fi
    if [[ -n $how ]]; then
      mv -f -- $tmp $darkf
      note "dark: $darkf (found by $how)"
      if zsh $DIR/shot.zsh $out/screenshots/$name-dark.jpg --full --page $PAGE >/dev/null; then
        note "shot: $out/screenshots/$name-dark.jpg"
      fi
    else
      rm -f -- $tmp
      note "dark: none"
    fi
    run set media --color-scheme light
    run reload
    run wait --load networkidle --timeout 15000
  fi
  return 0
}

main "$@"
