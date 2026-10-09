#!/usr/bin/env zsh
#
# finish.zsh — the last step of project-kickoff. Run from the project root:
#
#   zsh .claude/skills/project-kickoff/scripts/finish.zsh "<project name>" <path> ...
#
# 1. Links AGENTS.md -> CLAUDE.md next to every CLAUDE.md that has no AGENTS.md.
# 2. Drops this skill's row from .armaze-stack, if `aistack add` recorded one.
# 3. Commits the given paths plus .gitignore, .armaze-stack, .mcp.json and .claude/
#    (never this skill or settings.local.json) as "Project kickoff: <name>".
# 4. Only once the commit has succeeded, deletes this skill folder.
#
# Exits 1 without committing or deleting anything when it can't commit (not at a
# repo root, no git name or email), so the kickoff can be finished later.

emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

readonly SKILL_REL=.claude/skills/project-kickoff
readonly MANIFEST=.armaze-stack

fail() { print -r -u2 -- "finish: $*"; exit 1 }

main() {
  local name=${1:-}
  (( $# )) && shift
  [[ -n $name ]] || fail "usage: finish.zsh <project name> <path> ..."

  local top
  top=$(git rev-parse --show-toplevel 2>/dev/null) || fail "not inside a git repo — run from the project root"
  [[ ${top:A} == ${PWD:A} ]] || fail "run from the project root ($top), not $PWD"
  if [[ -z $(git config user.name) || -z $(git config user.email) ]]; then
    fail "git has no name or email set here. Set them, then finish the kickoff again:
  git config --global user.name \"Your Name\"
  git config --global user.email \"you@example.com\""
  fi

  # 1. AGENTS.md links, up to two levels down (apps/web/CLAUDE.md). Globs skip
  # dot-folders, so .claude/ and .claude-local/ are never touched.
  local f dir
  local -a linked=()
  for f in CLAUDE.md(N.) ^node_modules/CLAUDE.md(N.) ^node_modules/^node_modules/CLAUDE.md(N.); do
    dir=${f:h}
    [[ -e $dir/AGENTS.md || -L $dir/AGENTS.md ]] && continue
    ln -s CLAUDE.md "$dir/AGENTS.md" && linked+=("$dir/AGENTS.md")
  done
  linked=(${linked#./})

  # 2. This skill is a one-off; it must not be re-copied by `aistack update`.
  if [[ -f $MANIFEST ]] && awk -F'\t' -v p="$SKILL_REL" '!/^#/ && $3 == p { found = 1 } END { exit !found }' "$MANIFEST"; then
    awk -F'\t' -v p="$SKILL_REL" '/^#/ || $3 != p' "$MANIFEST" > "$MANIFEST.$$.tmp" && mv -f -- "$MANIFEST.$$.tmp" "$MANIFEST"
  fi

  # 3. Commit only what the kickoff wrote.
  local p
  local -a paths=()
  for p in "$@" "${linked[@]}" .gitignore $MANIFEST .mcp.json .claude; do
    [[ -e $p || -L $p ]] && paths+=("$p")
  done
  paths=("${(@u)paths}")
  if (( $#paths )); then
    git add -- "${paths[@]}" || fail "git add failed"
    # Unstaged again rather than excluded in the add: an exclude pathspec naming an
    # ignored file makes git add fail. --cached works before the first commit too.
    git rm -r -q --cached --ignore-unmatch -- "$SKILL_REL" .claude/settings.local.json >/dev/null
  fi

  if git diff --cached --quiet; then
    print -r -- "Nothing new to commit — everything the kickoff would write was already there."
  else
    git commit -q -m "Project kickoff: $name" || fail "git commit failed — the kickoff skill is kept so you can try again"
    print -r -- "Committed $(git rev-parse --short HEAD): Project kickoff: $name"
  fi

  # 4. Done: remove the skill.
  rm -rf -- "$SKILL_REL"
  rmdir .claude/skills 2>/dev/null
  print -r -- "Removed $SKILL_REL"
}

main "$@"
