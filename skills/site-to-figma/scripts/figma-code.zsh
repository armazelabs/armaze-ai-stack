#!/usr/bin/env zsh
#
# figma-code.zsh - print the JavaScript for one Figma build step, with the design system
# data already in it, ready to pass as the `code` of a use_figma call.
#
#   zsh <skill>/scripts/figma-code.zsh <step> --dir <site dir> [--batch <n>] [--node <id>[,<id>...]] [--set <id>]
#
#   inspect       read-only: pages, collections, styles, whether site-to-figma ran here before
#   variables     Primitives, Color (light/dark), Size and Typography collections
#   styles        text styles and effect styles
#   foundations   the documentation board on the Foundations page
#   assets        logo and icons as components; --batch <n> (1-based), the count goes to stderr
#   components    Button, Input, Badge and Card component sets
#   rebind        bind a captured page's colours, text, shadows, radii and spacing: --node <ids>
#   swap          replace captured buttons with Button instances: --node <ids> --set <Button set id>
#
# Reads <site dir>/figma-spec.json (and assets.jsonl for assets). Fails rather than print
# code over use_figma's 50,000-character limit.

emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

readonly SELF=${0:A}
readonly FIG=${SELF:h}/figma
readonly LIMIT=49000
readonly BATCH_BYTES=38000

fail() { print -r -u2 -- "figma-code: $*"; exit 1 }

# spec_keys <figma-spec.json> <key...> - a JSON object with only those top-level keys
# (synth.js writes the spec one key per line: "key": value)
spec_keys() {
  local file=$1 line k
  shift
  local -a want=($@) keep=()
  for line in "${(@f)$(<$file)}"; do
    [[ $line == \"* ]] || continue
    k=${${line#\"}%%\"*}
    (( ${want[(Ie)$k]} )) && keep+=(${line%,})
  done
  print -r -- "{${(j:,:)keep}}"
}

# idlist <a,b,c> - a JS array of strings
idlist() {
  local -a ids=(${(s:,:)1})
  print -r -- "[${(j:,:)${ids/(#m)*/\"$MATCH\"}}]"
}

main() {
  [[ ${1:-} == (-h|--help) ]] && { sed -n '3,20p' $SELF | sed 's/^# \{0,1\}//'; return 0 }
  local step=${1:-} dir= batch=1 node= set=
  (( $# )) && shift
  while (( $# )); do
    case $1 in
      --dir) dir=${2:-}; shift 2 || fail "--dir needs a folder" ;;
      --batch) batch=${2:-}; shift 2 || fail "--batch needs a number" ;;
      --node) node=${2:-}; shift 2 || fail "--node needs an id" ;;
      --set) set=${2:-}; shift 2 || fail "--set needs an id" ;;
      -h|--help) sed -n '3,20p' $SELF | sed 's/^# \{0,1\}//'; return 0 ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  [[ $step == (inspect|variables|styles|foundations|assets|components|rebind|swap) ]] || fail "unknown step: ${step:-none} (see --help)"
  [[ -s $dir/figma-spec.json ]] || fail "no figma-spec.json in ${dir:-?} (run synth.zsh first)"
  [[ $batch == <1-> ]] || fail "--batch must be 1 or more"

  local head lib=$(<$FIG/_lib.js) body=$(<$FIG/$step.js)
  local -a keys
  case $step in
    inspect|swap) keys=() ;;
    variables) keys=(site title modes primitives semantic space radius fonts) ;;
    styles) keys=(site fonts text shadows) ;;
    foundations) keys=(site title date pages modes primitives semantic space radius text shadows) ;;
    assets) keys=(site title) ;;
    components) keys=(site space radius components) ;;
    rebind) keys=(semantic) ;;
  esac
  head="const SPEC = $(spec_keys $dir/figma-spec.json $keys);"

  case $step in
    assets)
      # one batch of icons that fits the limit
      [[ -s $dir/assets.jsonl ]] || fail "no assets.jsonl in $dir (synth.zsh found no logo or icons)"
      local -a lines=("${(@f)$(<$dir/assets.jsonl)}")
      local logo=${lines[1]} line size=0 n=1
      local -a batches=() cur=()
      for line in ${lines[2,-1]}; do
        if (( size + ${#line} > BATCH_BYTES && $#cur )); then
          batches+=("${(j:,:)cur}"); cur=(); size=0
        fi
        cur+=($line); size=$(( size + ${#line} + 1 ))
      done
      (( $#cur )) && batches+=("${(j:,:)cur}")
      local total=$#batches
      (( total == 0 )) && total=1
      (( batch <= total )) || fail "there are only $total batch(es)"
      print -r -u2 -- "assets batch $batch of $total"
      if (( batch == 1 )); then head+=$'\n'"const LOGO = ($logo).logo;"; else head+=$'\n'"const LOGO = null;"; fi
      head+=$'\n'"const ICONS = [${batches[batch]:-}];"
      ;;
    rebind)
      [[ -n $node ]] || fail "rebind needs --node <captured frame id>[,<id>...]"
      head+=$'\n'"const NODE_IDS = $(idlist $node);"
      ;;
    swap)
      [[ -n $node && -n $set ]] || fail "swap needs --node <captured frame id> and --set <Button component set id>"
      head+=$'\n'"const NODE_IDS = $(idlist $node);"$'\n'"const SET_ID = \"$set\";"
      ;;
  esac

  local code="$head"$'\n'"$lib"$'\n'"$body"
  (( ${#code} <= LIMIT )) || fail "the $step code is ${#code} characters, over the limit ($LIMIT); trim figma-spec.json (fewer text styles or colours via overrides.json)"
  print -r -- $code
}

main "$@"
