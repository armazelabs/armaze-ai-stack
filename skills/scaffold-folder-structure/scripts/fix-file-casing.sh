#!/usr/bin/env bash
#
# fix-file-casing.sh - Normalises workspace file/folder names to the project's
# casing rules, in a way git actually records.
#
# TWO RULES, PULLING IN OPPOSITE DIRECTIONS
#
#   1. Ordinary workspace files are lowercase kebab-case:
#        Feature-Matrix.md  ->  feature-matrix.md
#   2. Conventional files keep their established uppercase spelling, because
#      tools, hosts, and humans look for those exact names:
#        readme.md  ->  README.md        changelog.md  ->  CHANGELOG.md
#
# Rule 2 is NOT an exemption from rule 1 - it is the opposite rename. A
# conventional file that has been lowercased is just as wrong as an ordinary
# file that has been capitalised, and this script repairs both directions.
#
# THE GIT TRAP
#
# macOS and Windows use case-insensitive filesystems, and git there defaults
# to `core.ignorecase = true`. Once a file is committed as `Feature-Matrix.md`,
# renaming it with a plain `mv` changes nothing git can see: `git status`
# stays clean, and the wrong name survives in history, in every other clone,
# and on case-sensitive Linux CI where it may then fail to resolve.
#
# A case-only rename must therefore go through a temporary third name, so git
# records a genuine delete + add:
#
#     git mv -f readme.md tmp-x  &&  git mv -f tmp-x README.md
#
# And when someone has already done a plain `mv`, the disk looks correct while
# the index still holds the old spelling - invisible to any filesystem scan.
# That is repaired by re-pointing the index instead:
#
#     git rm --cached readme.md  &&  git add README.md
#
# Both are handled below.
#
# Usage:
#   bash fix-file-casing.sh [target-root]           # report only (default)
#   bash fix-file-casing.sh [target-root] --fix     # perform the renames
#
# Renames are staged but never committed - review with `git status` and
# commit yourself.

set -euo pipefail

ROOT="${1:-$PWD}"
[ "$ROOT" = "--fix" ] && ROOT="$PWD"
MODE="report"
for arg in "$@"; do
  [ "$arg" = "--fix" ] && MODE="fix"
done

cd "$ROOT"

# The tree this skill governs. Application source, configs, and the tool
# directories (.claude/, node_modules/) are deliberately out of scope.
SCOPE_DIRS="research rules project-management-log design-system"
ROOT_FILES="feature.md"

# Conventional spellings, keyed by their lowercase form. A file whose name
# matches a key is renamed to the value, whatever case it arrived in.
canonical_for() {
  case "$1" in
    readme.md)           echo "README.md" ;;
    changelog.md)        echo "CHANGELOG.md" ;;
    claude.md)           echo "CLAUDE.md" ;;
    agents.md)           echo "AGENTS.md" ;;
    skill.md)            echo "SKILL.md" ;;
    license|license.md)  echo "LICENSE" ;;
    contributing.md)     echo "CONTRIBUTING.md" ;;
    code_of_conduct.md)  echo "CODE_OF_CONDUCT.md" ;;
    security.md)         echo "SECURITY.md" ;;
    makefile)            echo "Makefile" ;;
    dockerfile)          echo "Dockerfile" ;;
    *)                   echo "" ;;
  esac
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# Ordinary workspace name: lowercase, spaces/underscores to hyphens, collapse
# and trim stray hyphens.
kebab_name() {
  lower "$1" | tr ' _' '-' | sed -e 's/--*/-/g' -e 's/^-//' -e 's/-$//'
}

in_git=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && in_git=1

# Rename so that git records it, even when the change is case-only on a
# case-insensitive filesystem.
git_safe_rename() {
  local from="$1" to="$2" dir tmp
  dir="$(dirname "$from")"
  tmp="$dir/.casefix-$$-$(basename "$to")"

  if [ "$in_git" = "1" ] && git ls-files --error-unmatch "$from" >/dev/null 2>&1; then
    git mv -f "$from" "$tmp"
    git mv -f "$tmp" "$to"
  else
    mv "$from" "$tmp"
    mv "$tmp" "$to"
  fi
}

violations=0
fixed=0

check_path() {
  local path="${1#./}"
  local dir base want target
  dir="$(dirname "$path")"
  base="$(basename "$path")"

  want="$(canonical_for "$(lower "$base")")"
  [ -z "$want" ] && want="$(kebab_name "$base")"

  [ "$base" = "$want" ] && return 0

  violations=$((violations + 1))
  target="$dir/$want"
  target="${target#./}"

  if [ "$MODE" = "fix" ]; then
    if [ -e "$target" ] && [ "$(lower "$target")" != "$(lower "$path")" ]; then
      echo "  SKIP  $path  ->  $want  (target already exists)"
      return 0
    fi
    git_safe_rename "$path" "$target"
    fixed=$((fixed + 1))
    echo "  FIXED $path  ->  $want"
  else
    echo "  $path  ->  $want"
  fi
}

echo "Scanning for naming violations..."

# Files first, then directories deepest-first, so renaming a parent never
# invalidates a path still queued for checking.
for dir in $SCOPE_DIRS; do
  [ -d "$dir" ] || continue
  while IFS= read -r f; do
    check_path "$f"
  done < <(find "$dir" -type f | sort)
done

for f in $ROOT_FILES; do
  [ -e "$f" ] && check_path "$f"
done

for dir in $SCOPE_DIRS; do
  [ -d "$dir" ] || continue
  while IFS= read -r d; do
    check_path "$d"
  done < <(find "$dir" -mindepth 1 -type d -depth | sort -r)
done

# ---------------------------------------------------------------------------
# Second pass: index-vs-disk case drift.
#
# The case the first pass cannot see. If someone already renamed a file with a
# plain `mv`, the disk now looks correct, so scanning the filesystem finds
# nothing wrong - while git still tracks the old spelling and will keep
# serving it to every other clone. Only comparing the index against the disk
# reveals it.
# ---------------------------------------------------------------------------
if [ "$in_git" = "1" ]; then
  while IFS= read -r tracked; do
    in_scope=0
    for dir in $SCOPE_DIRS; do
      case "$tracked" in "$dir"/*) in_scope=1 ;; esac
    done
    for f in $ROOT_FILES; do
      [ "$tracked" = "$f" ] && in_scope=1
    done
    [ "$in_scope" = "1" ] || continue

    # Real on-disk spelling, resolved segment by segment so a case-insensitive
    # filesystem cannot simply hand back the name we asked for.
    actual=""
    ok=1
    IFS='/' read -r -a segs <<< "$tracked"
    for seg in "${segs[@]}"; do
      parent="${actual:-.}"
      match="$(ls -1 "$parent" 2>/dev/null | grep -ixF "$seg" | head -1 || true)"
      if [ -z "$match" ]; then ok=0; break; fi
      actual="${actual:+$actual/}$match"
    done
    [ "$ok" = "1" ] || continue
    [ "$actual" = "$tracked" ] && continue

    violations=$((violations + 1))
    if [ "$MODE" = "fix" ]; then
      git rm --cached --quiet "$tracked"
      git add "$actual"
      fixed=$((fixed + 1))
      echo "  FIXED (index) $tracked  ->  $actual"
    else
      echo "  (index) $tracked  ->  $actual   [git tracks the old spelling]"
    fi
  done < <(git ls-files)
fi

echo ""
if [ "$violations" -eq 0 ]; then
  echo "No naming violations found."
elif [ "$MODE" = "fix" ]; then
  echo "Renamed $fixed of $violations path(s). The renames are staged - review with 'git status' and commit."
else
  echo "Found $violations naming violation(s). Re-run with --fix to repair them."
  echo "A plain 'mv' will NOT fix these on macOS - see the header of this script."
fi
