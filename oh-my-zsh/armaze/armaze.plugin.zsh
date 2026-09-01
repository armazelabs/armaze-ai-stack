# Armaze AI Stack — oh-my-zsh plugin
#
# Puts the `aistack` CLI on PATH, exports ARMAZE_STACK_DIR, and adds tab completion.
# Enabled by ./install.zsh, or by hand:
#   ln -s <checkout>/oh-my-zsh/armaze "$ZSH_CUSTOM/plugins/armaze"
#   plugins+=(armaze)          # in ~/.zshrc, before oh-my-zsh loads

# Resolve this file's real path even when the plugin dir is a symlink.
0="${${ZERO:-${0:#$ZSH_ARGZERO}}:-${(%):-%N}}"
0="${${(M)0:#/*}:-$PWD/$0}"

export ARMAZE_STACK_DIR="${ARMAZE_STACK_DIR:-${0:A:h:h:h}}"

if [[ -d "$ARMAZE_STACK_DIR/bin" ]]; then
  path=("$ARMAZE_STACK_DIR/bin" $path)
  typeset -U path
fi

_aistack() {
  local -a subcmds=(
    'list:List available skills and agents'
    'add:Add skills/agents to the current repo'
    'update:Pull the latest stack, then refresh this repo'
    'root:Print the stack checkout path'
    'help:Show help'
    'version:Show version'
    '--help:Show help'
    '--version:Show version'
  )
  if (( CURRENT == 2 )); then
    _describe -t commands 'aistack command' subcmds
    return
  fi
  case ${words[2]} in
    list|ls)
      _arguments '--names[print type/name only]' '*:type:(skills agents)'
      ;;
    add|install)
      local -a comps
      comps=(${(f)"$(aistack list --names 2>/dev/null)"})
      _arguments \
        '(-t --to)'{-t,--to}'[target repo]:dir:_directories' \
        '(-p --platform)'{-p,--platform}'[destination layout]:platform:(claude generic)' \
        '--skills-dir[override skills destination]:dir:_directories' \
        '--agents-dir[override agents destination]:dir:_directories' \
        '(-s --skills)'{-s,--skills}'[only offer skills]' \
        '(-a --agents)'{-a,--agents}'[only offer agents]' \
        '(-f --force)'{-f,--force}'[overwrite without asking]' \
        '(-l --link)'{-l,--link}'[symlink instead of copy]' \
        '*:component:('"${comps[*]}"')'
      ;;
    update|upgrade)
      _arguments \
        '(-t --to)'{-t,--to}'[target repo]:dir:_directories'
      ;;
  esac
}

(( $+functions[compdef] )) && compdef _aistack aistack
