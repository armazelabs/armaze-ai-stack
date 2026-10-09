#!/usr/bin/env zsh
#
# elements.zsh - dump the content and structure of the page in an Orca browser tab
# as JSON: headings, verbatim copy, navigation, links, buttons, every form field,
# tabs, tables, images, open dialogs and live messages. Prints to stdout.
#
#   zsh <skill>/scripts/elements.zsh [--page <browserPageId>]
#
# --page targets one tab (from `orca tab list --json`); without it, the active tab.
# The extraction itself is extract-elements.js, next to this script.

emulate -R zsh
setopt pipe_fail typeset_silent

readonly SELF=${0:A}

fail() { print -r -u2 -- "elements: $*"; exit 1 }

orca_bin() {
  local o
  o=$(command -v orca 2>/dev/null) && { print -r -- $o; return }
  o=/Applications/Orca.app/Contents/Resources/bin/orca
  [[ -x $o ]] && { print -r -- $o; return }
  return 1
}

main() {
  local page=
  while (( $# )); do
    case $1 in
      --page) page=${2:-}; shift 2 || fail "--page needs an id" ;;
      -h|--help) print -r -- "usage: elements.zsh [--page <browserPageId>]"; return 0 ;;
      *) fail "unknown option: $1" ;;
    esac
  done

  local orca js
  orca=$(orca_bin) || fail "the orca CLI was not found; open Orca, or put its bin/ on PATH"
  js=${SELF:h}/extract-elements.js
  [[ -r $js ]] || fail "missing $js"

  local -a args=(eval --expression "$(<$js)")
  [[ -n $page ]] && args+=(--page $page)
  $orca $args || fail "orca eval failed (is a page open in the browser tab?)"
}

main "$@"
