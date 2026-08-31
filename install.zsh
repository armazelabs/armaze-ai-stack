#!/usr/bin/env zsh
#
# One-time setup for Armaze members.
#
# Links this checkout's oh-my-zsh plugin into $ZSH_CUSTOM/plugins/armaze and,
# with your OK, adds `plugins+=(armaze)` to ~/.zshrc so the `armaze` command
# is available in every shell.
#
#   ./install.zsh            interactive
#   ./install.zsh --yes      edit ~/.zshrc without asking
#   ./install.zsh --no-rc    link the plugin only; you edit ~/.zshrc yourself

emulate -R zsh
setopt pipe_fail

REPO="${0:A:h}"
ZSHRC="${ZDOTDIR:-$HOME}/.zshrc"
OMZ="${ZSH:-$HOME/.oh-my-zsh}"
ZSH_CUSTOM="${ZSH_CUSTOM:-$OMZ/custom}"
PLUGIN_SRC="$REPO/oh-my-zsh/armaze"
PLUGIN_DST="$ZSH_CUSTOM/plugins/armaze"
RC_LINE='plugins+=(armaze)   # Armaze AI Stack CLI'

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\e[0m' C_BOLD=$'\e[1m' C_DIM=$'\e[2m'
  C_RED=$'\e[31m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_BLUE=$'\e[34m'
else
  C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE=""
fi
info() { print -r -- "${C_BLUE}==>${C_RESET} $*" }
ok()   { print -r -- "${C_GREEN}✔${C_RESET} $*" }
warn() { print -r -u2 -- "${C_YELLOW}!${C_RESET} $*" }
die()  { print -r -u2 -- "${C_RED}error:${C_RESET} $*"; exit 1 }

usage() {
  cat <<USAGE
${C_BOLD}install.zsh${C_RESET} — set up the armaze CLI for this shell

  ./install.zsh            interactive
  ./install.zsh --yes      edit ~/.zshrc without asking
  ./install.zsh --no-rc    link the plugin only; you edit ~/.zshrc yourself
USAGE
}

assume_yes=0 edit_rc=1
for arg in "$@"; do
  case $arg in
    -y|--yes)  assume_yes=1 ;;
    --no-rc)   edit_rc=0 ;;
    -h|--help) usage; exit 0 ;;
    *)         die "unknown option '$arg' (see: ./install.zsh --help)" ;;
  esac
done

[[ -d $OMZ ]] || die "oh-my-zsh not found at $OMZ — set \$ZSH if it lives somewhere else"
[[ -f $PLUGIN_SRC/armaze.plugin.zsh ]] || die "plugin source missing: $PLUGIN_SRC"

chmod +x "$REPO/bin/armaze" 2>/dev/null

# 1. Link the plugin -----------------------------------------------------------
mkdir -p -- "$ZSH_CUSTOM/plugins" || die "cannot create $ZSH_CUSTOM/plugins"
if [[ -L $PLUGIN_DST ]]; then
  if [[ ${PLUGIN_DST:A} == ${PLUGIN_SRC:A} ]]; then
    ok "plugin already linked → ${PLUGIN_DST/#$HOME/~}"
  else
    warn "re-pointing ${PLUGIN_DST/#$HOME/~} (was → $(readlink "$PLUGIN_DST"))"
    rm -f -- "$PLUGIN_DST" && ln -s -- "$PLUGIN_SRC" "$PLUGIN_DST" || die "could not relink plugin"
    ok "plugin linked → ${PLUGIN_DST/#$HOME/~}"
  fi
elif [[ -e $PLUGIN_DST ]]; then
  die "$PLUGIN_DST exists and is not a symlink — move it aside and re-run"
else
  ln -s -- "$PLUGIN_SRC" "$PLUGIN_DST" || die "could not link plugin"
  ok "plugin linked → ${PLUGIN_DST/#$HOME/~}"
fi

# 2. Enable it in ~/.zshrc -----------------------------------------------------
if (( edit_rc )); then
  if [[ -f $ZSHRC ]] && grep -Eq '^[^#]*armaze' "$ZSHRC"; then
    ok "${ZSHRC/#$HOME/~} already mentions armaze — leaving it alone"
  else
    print
    print -r -- "To enable the plugin, this line must run in ${ZSHRC/#$HOME/~} ${C_BOLD}before${C_RESET} oh-my-zsh loads:"
    print -r -- "    ${C_BOLD}plugins+=(armaze)${C_RESET}"
    do_edit=$assume_yes
    if (( ! assume_yes )) && [[ -t 0 && -t 1 ]]; then
      if read -q "ans?Add it now? A backup of .zshrc is kept. [y/N] "; then do_edit=1; fi
      print
    fi
    if (( do_edit )); then
      [[ -f $ZSHRC ]] || : > "$ZSHRC"
      backup="$ZSHRC.armaze-backup.$(date +%Y%m%d%H%M%S)"
      cp -- "$ZSHRC" "$backup" || die "could not back up $ZSHRC"
      if grep -Eq '^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh' "$ZSHRC"; then
        awk -v line="$RC_LINE" '
          !done && /^[[:space:]]*source[[:space:]]+.*oh-my-zsh\.sh/ { print line; done = 1 }
          { print }
        ' "$ZSHRC" > "$ZSHRC.tmp.$$" && mv -f -- "$ZSHRC.tmp.$$" "$ZSHRC" || die "could not edit $ZSHRC"
        ok "added 'plugins+=(armaze)' before oh-my-zsh loads in ${ZSHRC/#$HOME/~} ${C_DIM}(backup: ${backup:t})${C_RESET}"
      else
        print -r -- "$RC_LINE" >> "$ZSHRC"
        warn "couldn't find the 'source \$ZSH/oh-my-zsh.sh' line — appended to the end instead."
        warn "Move 'plugins+=(armaze)' above the line that loads oh-my-zsh if the command isn't found."
      fi
    else
      info "skipped editing ${ZSHRC/#$HOME/~} — add the line yourself when you're ready"
    fi
  fi
fi

# 3. Done ----------------------------------------------------------------------
print
print -r -- "${C_BOLD}Next:${C_RESET} open a new shell (or run: source ${ZSHRC/#$HOME/~}), then try"
print -r -- "    armaze list"
print -r -- "    cd ~/your-project && armaze add"
