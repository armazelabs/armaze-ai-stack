#!/usr/bin/env zsh
#
# Set up the armaze CLI on this machine. Two ways to run it:
#
#   curl -fsSL https://raw.githubusercontent.com/armazelabs/armaze-ai-stack/main/install.zsh | zsh
#       No checkout yet: clones the stack to ~/armaze-ai-stack (or $ARMAZE_STACK_DIR)
#       and continues as below. Running it again pulls the latest stack instead.
#
#   ./install.zsh
#       From an existing checkout.
#
# Either way it links the checkout's oh-my-zsh plugin into $ZSH_CUSTOM/plugins/armaze
# and, with your OK, adds `plugins+=(armaze)` to ~/.zshrc so `armaze` is on PATH in
# every shell.
#
#   --yes      edit ~/.zshrc without asking
#   --no-rc    link the plugin only; you edit ~/.zshrc yourself
#
# Environment:
#   ARMAZE_STACK_DIR   where to clone when bootstrapping (default: ~/armaze-ai-stack)
#   ARMAZE_REPO_URL    what to clone (default: the GitHub repo)

emulate -R zsh
setopt pipe_fail

ZSHRC="${ZDOTDIR:-$HOME}/.zshrc"
OMZ="${ZSH:-$HOME/.oh-my-zsh}"
ZSH_CUSTOM="${ZSH_CUSTOM:-$OMZ/custom}"
RC_LINE='plugins+=(armaze)   # Armaze AI Stack CLI'
REPO_URL="${ARMAZE_REPO_URL:-https://github.com/armazelabs/armaze-ai-stack.git}"

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

  curl -fsSL https://raw.githubusercontent.com/armazelabs/armaze-ai-stack/main/install.zsh | zsh
                           clone the stack to ~/armaze-ai-stack (or \$ARMAZE_STACK_DIR) and set up
  ./install.zsh            from an existing checkout
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

[[ -d $OMZ ]] || die "oh-my-zsh not found at $OMZ — install it first (https://ohmyz.sh), or set \$ZSH if it lives somewhere else"

# 0. Find the checkout — or make one ------------------------------------------
# Run from a checkout, $0 is this file inside the repo. Piped from curl, $0 is
# just "zsh": clone (or pull) the stack, then re-run this script from the
# checkout with the terminal on stdin so the .zshrc prompt still works.
SELF="${0:A}"
if [[ -f $SELF && -f ${SELF:h}/bin/armaze && -f ${SELF:h}/oh-my-zsh/armaze/armaze.plugin.zsh ]]; then
  REPO="${SELF:h}"
else
  (( $+commands[git] )) || die "git is required to fetch the stack"
  REPO="${ARMAZE_STACK_DIR:-$HOME/armaze-ai-stack}"
  REPO="${REPO:A}"
  if [[ -f $REPO/bin/armaze ]]; then
    info "stack already at ${REPO/#$HOME/~} — pulling the latest"
    git -C "$REPO" pull --ff-only --quiet || warn "git pull failed — continuing with the checkout as it is"
  elif [[ -e $REPO ]]; then
    die "$REPO exists but is not an armaze-ai-stack checkout — set ARMAZE_STACK_DIR to another path"
  else
    info "cloning $REPO_URL → ${REPO/#$HOME/~}"
    git clone --quiet -- "$REPO_URL" "$REPO" || die "clone failed"
  fi
  if { : </dev/tty; } 2>/dev/null; then
    exec zsh "$REPO/install.zsh" "$@" </dev/tty
  else
    exec zsh "$REPO/install.zsh" "$@"
  fi
fi

PLUGIN_SRC="$REPO/oh-my-zsh/armaze"
PLUGIN_DST="$ZSH_CUSTOM/plugins/armaze"
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
print -r -- "${C_BOLD}Next:${C_RESET} open a new shell (or run: exec zsh), then try"
print -r -- "    armaze list                          what the stack offers"
print -r -- "    cd ~/your-project && armaze add      pick skills to add"
print -r -- "    armaze self-update                   pull the latest stack later on"
