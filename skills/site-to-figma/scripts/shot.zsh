#!/usr/bin/env zsh
#
# shot.zsh - save a JPEG screenshot of an Orca browser tab to a chosen path.
#
#   zsh <skill>/scripts/shot.zsh <out.jpg> [--full] [--page <browserPageId>] [--quality <1-100>]
#
# --full captures the whole scrollable page instead of the viewport. --page targets
# one tab (from `orca tab list --json`); without it, the active tab. The parent
# folder is created. Prints the saved path; exits 1 if no JPEG was written.
#
# `orca screenshot --format jpeg` returns PNG data, so this goes through the
# browser's own screenshot command, which writes a real JPEG to the given path.

emulate -R zsh
setopt pipe_fail typeset_silent

fail() { print -r -u2 -- "shot: $*"; exit 1 }

orca_bin() {
  local o
  o=$(command -v orca 2>/dev/null) && { print -r -- $o; return }
  o=/Applications/Orca.app/Contents/Resources/bin/orca
  [[ -x $o ]] && { print -r -- $o; return }
  return 1
}

is_jpeg() {
  [[ -s $1 ]] || return 1
  [[ $(od -An -tx1 -N3 -- "$1" 2>/dev/null | tr -d ' \n') == ffd8ff ]]
}

main() {
  local out= page= full= quality=85
  while (( $# )); do
    case $1 in
      --full) full=1; shift ;;
      --page) page=${2:-}; shift 2 || fail "--page needs an id" ;;
      --quality) quality=${2:-}; shift 2 || fail "--quality needs a number" ;;
      -h|--help) print -r -- "usage: shot.zsh <out.jpg> [--full] [--page <id>] [--quality <1-100>]"; return 0 ;;
      -*) fail "unknown option: $1" ;;
      *) [[ -z $out ]] || fail "only one output path"; out=$1; shift ;;
    esac
  done
  [[ -n $out ]] || fail "usage: shot.zsh <out.jpg> [--full] [--page <id>]"
  [[ $out == *.(jpg|jpeg) ]] || fail "screenshots are JPEG; name the file .jpg ($out)"
  [[ $quality == <1-100> ]] || fail "--quality must be 1-100"
  [[ $out == *[[:space:]\'\"]* ]] && fail "no spaces or quotes in the file name: $out"

  local orca
  orca=$(orca_bin) || fail "the orca CLI was not found; open Orca, or put its bin/ on PATH"

  mkdir -p -- "${out:h}" || fail "cannot create ${out:h}"
  out=${out:A}
  [[ -e $out ]] && fail "already exists, not overwriting: $out"

  local cmd="screenshot${full:+ --full} $out --screenshot-format jpeg --screenshot-quality $quality"
  local -a args=(exec --command "$cmd" --json)
  [[ -n $page ]] && args+=(--page $page)
  local res
  res=$($orca $args 2>&1)
  if ! is_jpeg $out; then
    rm -f -- "$out"
    fail "no JPEG written to $out
$res"
  fi
  print -r -- $out
}

main "$@"
