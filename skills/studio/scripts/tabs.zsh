#!/usr/bin/env zsh
# Open or close the design-unicorn crew's Orca tabs: one named tab per member, each running
# `claude --agent <member>` on the model the profile's preset gives it. /studio start and
# /studio stop run this; the director reuses the tabs through the handles saved here.
#
#   zsh tabs.zsh open [--members-only] [ACCOUNT]   open what isn't open yet (--members-only: not the director)
#   zsh tabs.zsh close                             close every tab it opened and forget the run
#
# ACCOUNT is the shell command that starts Claude under another login (a function from
# ~/.zshrc such as claude-girudo); the tabs run it in place of `claude`. It is kept in
# log/account until close, so a later open without one reuses it.
#
# Handles go to project-management/design-unicorn/log/tabs.json, one "member": "handle" per
# line (the log folder is gitignored). Running open again reuses the tabs that are still live.
emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

die() { print -r -- "$*" >&2; exit 1 }

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$PWD
crew=$root/project-management/design-unicorn
tabs=$crew/log/tabs.json
log=$crew/log/activity.log
acct_file=$crew/log/account
usage="usage: zsh tabs.zsh open [--members-only] [ACCOUNT] | close"

# The tab order; the director comes first and gets the focus at the end.
members=(design-unicorn designer reviewer engineer researcher writer apprentice)

title_of() {
  case $1 in
    design-unicorn) print -r -- Director ;;
    *)              print -r -- ${(C)1} ;;
  esac
}

# The model for a member under the profile's preset (quality, balanced or economy).
model_of() {  # <member> <preset>
  local -a m   # quality balanced economy
  case $1 in
    design-unicorn)             m=(opus opus sonnet) ;;
    designer|reviewer|engineer) m=(opus sonnet sonnet) ;;
    researcher)                 m=(sonnet sonnet haiku) ;;
    *)                          m=(sonnet haiku haiku) ;;   # writer, apprentice
  esac
  case $2 in
    balanced) print -r -- ${m[2]} ;;
    economy)  print -r -- ${m[3]} ;;
    *)        print -r -- ${m[1]} ;;
  esac
}

# "handle" for a member from tabs.json, or nothing.
saved_handle() {  # <member>
  [[ -f $tabs ]] || return 0
  sed -n "s/^ *\"$1\": *\"\\([^\"]*\\)\".*/\\1/p" "$tabs" | head -1
}

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ }

write_tabs() {  # <member=handle>...
  local -a rows=() kv
  for kv in "$@"; do rows+=("  \"${kv%%=*}\": \"${kv#*=}\""); done
  { print '{'; print -r -- "${(pj:,\n:)rows}"; print '}'; } > "$tabs"
}

cmd_open() {
  local only_members=0 acct='' a
  for a in "$@"; do
    case $a in
      --members-only) only_members=1 ;;
      # typed into the tab's shell, so a plain command name only
      [A-Za-z0-9_.][A-Za-z0-9_.-]#) [[ -z $acct ]] || die "$usage"; acct=$a ;;
      *) die "$usage" ;;
    esac
  done
  command -v orca >/dev/null || die "Orca isn't running here (no orca command). Open the project in Orca, then try again."
  [[ -f $crew/profile.md ]] || die "This project has no design-unicorn setup yet. Run /studio setup first."

  local preset
  preset=$(awk -F': *' '$1 == "models" { print $2; exit }' "$crew/profile.md")
  [[ $preset == (quality|balanced|economy) ]] || preset=quality

  # the project's own Claude login, if aistack init gave it one (same rules as the claude wrapper)
  local login=''
  [[ -d $root/.claude-local ]] \
    && login="env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR=${(q)root}/.claude-local "

  mkdir -p -- "$crew/log"
  if [[ -n $acct ]]; then
    print -r -- "$acct" > "$acct_file"
  elif [[ -f $acct_file ]]; then
    acct=$(<"$acct_file")
    [[ $acct == [A-Za-z0-9_.][A-Za-z0-9_.-]# ]] || acct=''
  fi
  # an account function sets its own config dir, and env can't run a shell function
  local claude="${login}claude" note=''
  [[ -n $acct ]] && { claude=$acct; note=", $acct" }

  local live
  live=$(orca terminal list --json 2>/dev/null) || live=''

  local m h title model out
  local -a kept=()
  for m in "${members[@]}"; do
    h=$(saved_handle "$m")
    title=$(title_of "$m")
    if [[ -n $h && $live == *\"$h\"* ]]; then
      print -r -- "  $title: already open"
      kept+=("$m=$h")
      continue
    fi
    if (( only_members )) && [[ $m == design-unicorn ]]; then
      continue
    fi
    model=$(model_of "$m" "$preset")
    out=$(orca terminal create --worktree "path:$root" --title "$title" \
      --command "$claude --agent $m --name $m --model $model" --json 2>&1) \
      || { print -r -- "  $title: couldn't open ($out)"; continue }
    h=$(print -r -- "$out" | grep -o '"handle": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    [[ -n $h ]] || { print -r -- "  $title: opened, but Orca gave no handle"; continue }
    kept+=("$m=$h")
    print -r -- "  $title: opened ($model$note)"
    print -r -- "$(stamp) · ${(U)m} · tab opened" >> "$log"
  done
  write_tabs "${kept[@]}"

  if (( ! only_members )); then
    h=$(saved_handle design-unicorn)
    [[ -n $h ]] && orca terminal switch --terminal "$h" >/dev/null 2>&1
    print -r -- "The crew is open. Talk to the director in its tab."
  else
    print -r -- "The crew is open."
  fi
}

cmd_close() {
  if [[ ! -f $tabs ]]; then print -r -- "No crew tabs recorded."; return 0; fi
  local m h
  for m in "${members[@]}"; do
    h=$(saved_handle "$m")
    [[ -n $h ]] || continue
    if orca terminal close --terminal "$h" --json >/dev/null 2>&1; then
      print -r -- "  $(title_of "$m"): closed"
    else
      print -r -- "  $(title_of "$m"): already gone"
    fi
    print -r -- "$(stamp) · ${(U)m} · tab closed" >> "$log"
  done
  rm -f -- "$tabs" "$crew/log/run-id" "$acct_file"
  print -r -- "The crew's tabs are closed. Work in progress stays in the task files; /studio start opens them again."
}

case ${1:-} in
  open)  shift; cmd_open "$@" ;;
  close) cmd_close ;;
  *)     die "$usage" ;;
esac
