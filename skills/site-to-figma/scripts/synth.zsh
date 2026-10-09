#!/usr/bin/env zsh
#
# synth.zsh - turn a scan folder into the design system files. The maths runs in an
# Orca browser tab (synth.js, merge-assets.js), so nothing beyond Orca is needed.
#
#   zsh <skill>/scripts/synth.zsh --scan <scan dir> --out <site dir> --page <browserPageId>
#                                 [--site <url>] [--title <name>]
#
# Reads <scan dir>/raw/*.light.json (+ .dark.json, .assets.json) and, when present,
# <site dir>/overrides.json (your review changes) and the previous <site dir>/figma-spec.json
# (for the "changes since the last run" section). Writes, replacing earlier copies:
#
#   <site dir>/tokens.json       W3C design tokens (colour, semantic, space, radius, type, shadow, motion)
#   <site dir>/figma-spec.json   the same, shaped for the Figma build scripts
#   <site dir>/review.md         what was found, for the review stop
#   <site dir>/assets.jsonl      logo (line 1) and de-duplicated icons, one per line
#
# The previous figma-spec.json is kept as <scan dir>/figma-spec.previous.json.

emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

readonly SELF=${0:A}
readonly DIR=${SELF:h}
readonly MAX_EXPR=950000
readonly SEP=$'\n@@STF@@\n'

fail() { print -r -u2 -- "synth: $*"; exit 1 }

orca_bin() {
  local o
  o=$(command -v orca 2>/dev/null) && { print -r -- $o; return }
  o=/Applications/Orca.app/Contents/Resources/bin/orca
  [[ -x $o ]] && { print -r -- $o; return }
  return 1
}

# jstr <text> - the text as a JSON string literal
jstr() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\t'/\\t}
  print -r -- "\"$s\""
}

main() {
  local scan= out= page= site= title=
  while (( $# )); do
    case $1 in
      --scan) scan=${2:-}; shift 2 || fail "--scan needs a folder" ;;
      --out) out=${2:-}; shift 2 || fail "--out needs a folder" ;;
      --page) page=${2:-}; shift 2 || fail "--page needs an id" ;;
      --site) site=${2:-}; shift 2 || fail "--site needs a URL" ;;
      --title) title=${2:-}; shift 2 || fail "--title needs a name" ;;
      -h|--help) sed -n '3,20p' $SELF | sed 's/^# \{0,1\}//'; return 0 ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  [[ -d $scan/raw ]] || fail "no scan found: $scan/raw (run scan.zsh first)"
  [[ -n $out ]] || fail "give --out <site dir>"
  [[ -n $page ]] || fail "give --page <browserPageId> (any open Orca tab)"
  local orca
  orca=$(orca_bin) || fail "the orca CLI was not found; open Orca, or put its bin/ on PATH"
  mkdir -p -- $out || fail "cannot create $out"

  local -a lights=($scan/raw/*.light.json(N))
  (( $#lights )) || fail "no *.light.json files in $scan/raw"

  # pages array: [{"name":..,"light":{..},"dark":{..}|null}, ...]
  local pages='[' f name dark sep=
  for f in $lights; do
    name=${${f:t}%.light.json}
    dark=$scan/raw/$name.dark.json
    pages+="$sep{\"name\":$(jstr $name),\"light\":$(<$f),\"dark\":"
    if [[ -s $dark ]]; then pages+="$(<$dark)"; else pages+='null'; fi
    pages+='}'
    sep=,
  done
  pages+=']'

  local overrides=null previous=null
  [[ -s $out/overrides.json ]] && overrides=$(<$out/overrides.json)
  [[ -s $out/figma-spec.json ]] && previous=$(<$out/figma-spec.json)
  local opts="{\"site\":$(jstr $site),\"title\":$(jstr $title),\"date\":$(jstr $(date +%Y-%m-%d)),\"overrides\":$overrides,\"previous\":$previous}"

  local expr="($(<$DIR/synth.js))($pages,$opts)"
  (( ${#expr} < MAX_EXPR )) || fail "the scans are too large to merge in one go (${#expr} bytes); scan fewer pages"
  local res
  res=$($orca eval --expression "$expr" --page $page 2>&1) || fail "orca eval failed: ${res[1,400]}"
  [[ $res == *$SEP*$SEP* ]] || fail "synth.js failed: ${res[1,600]}"

  local tokens=${res%%$SEP*}
  local rest=${res#*$SEP}
  local spec=${rest%%$SEP*}
  local review=${rest#*$SEP}

  if [[ -s $out/figma-spec.json && ! -e $scan/figma-spec.previous.json ]]; then
    cp -- $out/figma-spec.json $scan/figma-spec.previous.json
  fi
  print -r -- $tokens > $out/tokens.json
  print -r -- $spec > $out/figma-spec.json
  print -r -- $review > $out/review.md

  # assets: fold each page's file into one de-duplicated list
  local acc= a recs
  for a in $scan/raw/*.assets.json(N); do
    recs="[${(j:,:)${(f)acc}}]"
    expr="($(<$DIR/merge-assets.js))($recs,$(<$a))"
    (( ${#expr} < MAX_EXPR )) || { print -r -u2 -- "synth: skipped ${a:t}: too large"; continue }
    res=$($orca eval --expression "$expr" --page $page 2>&1)
    if [[ $res == '{"logo":'* ]]; then acc=$res; else print -r -u2 -- "synth: could not merge ${a:t}: ${res[1,300]}"; fi
  done
  [[ -n $acc ]] && print -r -- $acc > $out/assets.jsonl

  local icons=0
  [[ -n $acc ]] && icons=$(( ${#${(f)acc}} - 1 ))
  print -r -- "tokens: $out/tokens.json"
  print -r -- "spec: $out/figma-spec.json ($(grep -o '"hex":' $out/figma-spec.json | wc -l | tr -d ' ') colours, $(grep -o '"name":' $out/figma-spec.json | wc -l | tr -d ' ') named items)"
  print -r -- "review: $out/review.md"
  print -r -- "assets: ${acc:+$out/assets.jsonl }($icons icons)"
}

main "$@"
