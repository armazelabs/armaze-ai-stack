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

# Inside a project set up by `aistack init`, run claude with that project's own
# config dir (.claude-local), so it has its own login and settings. Variables
# that would override the login are dropped. Pass-through everywhere else, when
# CLAUDE_CONFIG_DIR is already set, or with ARMAZE_CLAUDE_GLOBAL=1.
if (( ! $+aliases[claude] && ! $+functions[claude] )); then
  function claude {
    emulate -L zsh
    local d=$PWD root='' common=''
    if [[ -z ${ARMAZE_CLAUDE_GLOBAL:-} && -z ${CLAUDE_CONFIG_DIR:-} ]]; then
      while [[ $d != / && $d != $HOME ]]; do
        if [[ -d $d/.claude-local ]]; then root=$d; break; fi
        d=${d:h}
      done
      # A git worktree shares the main checkout's login.
      if [[ -z $root ]] && common=$(command git rev-parse --git-common-dir 2>/dev/null); then
        common=${common:A:h}
        [[ $common != $HOME && -d $common/.claude-local ]] && root=$common
      fi
    fi
    if [[ -z $root ]] || (( ! $+commands[claude] )); then
      command claude "$@"
      return
    fi
    [[ -t 2 ]] && print -ru2 -- $'\e[2m'"claude: project login (${root/#$HOME/~}/.claude-local)"$'\e[0m'
    env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u CLAUDE_CODE_OAUTH_TOKEN \
      CLAUDE_CONFIG_DIR="$root/.claude-local" claude "$@"
  }
fi

_aistack() {
  local -a subcmds=(
    'list:List available skills and agents'
    'add:Add skills/agents to the current repo'
    'update:Pull the latest stack, then refresh this repo'
    'init:Start a project here, with its own Claude login'
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
    init)
      _arguments \
        '(-t --to)'{-t,--to}'[folder to set up]:dir:_directories' \
        '--no-carry[do not copy global settings, skills and MCP servers]' \
        '--no-plugins[do not reinstall global plugins]' \
        '(--no-launch)--launch[open Claude into /project-kickoff at the end]' \
        '(--launch)--no-launch[only set up]'
      ;;
  esac
}

(( $+functions[compdef] )) && compdef _aistack aistack
