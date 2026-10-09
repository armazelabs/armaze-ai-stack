#!/usr/bin/env zsh
#
# secrets.zsh - keep product-teardown logins in a local file the repo never sees:
# <project root>/.claude/product-teardown.local.env (mode 600, added to .gitignore).
#
#   zsh <skill>/scripts/secrets.zsh path                       where the file is
#   zsh <skill>/scripts/secrets.zsh list                       products with a saved login
#   zsh <skill>/scripts/secrets.zsh has <product>              exit 0 if a login is saved
#   zsh <skill>/scripts/secrets.zsh user <product>             print the username and login URL (never the password)
#   zsh <skill>/scripts/secrets.zsh set <product> [--url <u>]  read username, then password, one per line on stdin
#   zsh <skill>/scripts/secrets.zsh fill <product> --user-ref <@eN> --pass-ref <@eN> [--page <id>]
#                                                              type the saved login into an Orca tab's fields
#
# <product> is a kebab-case slug (acme-crm). The file holds ACME_CRM_USER=, ACME_CRM_PASS=
# and ACME_CRM_URL= lines; values run to the end of the line. Run from inside the project.

emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

readonly REL=.claude/product-teardown.local.env
readonly SELF=${0:A}

fail() { print -r -u2 -- "secrets: $*"; exit 1 }

orca_bin() {
  local o
  o=$(command -v orca 2>/dev/null) && { print -r -- $o; return }
  o=/Applications/Orca.app/Contents/Resources/bin/orca
  [[ -x $o ]] && { print -r -- $o; return }
  return 1
}

project_root() {
  local top
  top=$(git rev-parse --show-toplevel 2>/dev/null) && { print -r -- $top; return }
  print -r -- $PWD
}

check_slug() {
  [[ $1 == [a-z0-9]##(-[a-z0-9]##)# ]] || fail "product must be kebab-case (acme-crm), got: ${1:-nothing}"
}

key_prefix() {
  local k=${(U)1}
  print -r -- ${k//-/_}
}

# value <file> <KEY> - print the value of KEY=, or return 1
value() {
  local line
  [[ -r $1 ]] || return 1
  while IFS= read -r line; do
    [[ $line == $2=* ]] && { print -r -- ${line#*=}; return 0 }
  done < $1
  return 1
}

ensure_ignored() {
  local root=$1 gi=$1/.gitignore
  if git -C $root rev-parse --git-dir >/dev/null 2>&1 && git -C $root check-ignore -q -- $REL 2>/dev/null; then
    return 0
  fi
  [[ -f $gi ]] && grep -qxF -- $REL $gi && return 0
  if [[ -s $gi && -n $(tail -c 1 -- $gi) ]]; then
    print >> $gi
  fi
  print -r -- $REL >> $gi
}

cmd_set() {
  local product=$1 url=
  shift
  while (( $# )); do
    case $1 in
      --url) url=${2:-}; shift 2 || fail "--url needs a value" ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  local user pass
  IFS= read -r user || true
  IFS= read -r pass || true
  [[ -n $user && -n $pass ]] || fail "send the username and the password on stdin, one per line"

  local root file pre
  root=$(project_root)
  file=$root/$REL
  pre=$(key_prefix $product)
  [[ -z $url ]] && url=$(value $file ${pre}_URL)

  umask 077
  mkdir -p -- ${file:h} || fail "cannot create ${file:h}"
  local tmp=$file.$$.tmp line
  {
    print -r -- "# product-teardown logins. Local only: never commit, never paste into docs."
    if [[ -r $file ]]; then
      while IFS= read -r line; do
        [[ $line == \#* || $line == ${pre}_(USER|PASS|URL)=* || -z $line ]] && continue
        print -r -- $line
      done < $file
    fi
    print -r -- "${pre}_USER=$user"
    print -r -- "${pre}_PASS=$pass"
    if [[ -n $url ]]; then print -r -- "${pre}_URL=$url"; fi
  } > $tmp || { rm -f -- $tmp; fail "cannot write $tmp" }
  chmod 600 $tmp && mv -f -- $tmp $file || { rm -f -- $tmp; fail "cannot save $file" }
  ensure_ignored $root
  print -r -- "saved the $product login in $REL (git-ignored, readable only by you)"
}

cmd_fill() {
  local product=$1 uref= pref= page=
  shift
  while (( $# )); do
    case $1 in
      --user-ref) uref=${2:-}; shift 2 || fail "--user-ref needs a ref" ;;
      --pass-ref) pref=${2:-}; shift 2 || fail "--pass-ref needs a ref" ;;
      --page) page=${2:-}; shift 2 || fail "--page needs an id" ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  [[ -n $uref || -n $pref ]] || fail "give --user-ref and/or --pass-ref (refs from orca snapshot)"

  local file pre user pass orca
  file=$(project_root)/$REL
  pre=$(key_prefix $product)
  orca=$(orca_bin) || fail "the orca CLI was not found"
  local -a pg=()
  [[ -n $page ]] && pg=(--page $page)
  if [[ -n $uref ]]; then
    user=$(value $file ${pre}_USER) || fail "no saved username for $product"
    $orca fill --element $uref --value "$user" $pg --json >/dev/null 2>&1 || fail "could not fill the username field ($uref); re-snapshot and retry"
  fi
  if [[ -n $pref ]]; then
    pass=$(value $file ${pre}_PASS) || fail "no saved password for $product"
    $orca fill --element $pref --value "$pass" $pg --json >/dev/null 2>&1 || fail "could not fill the password field ($pref); re-snapshot and retry"
  fi
  print -r -- "filled the saved $product login"
}

main() {
  local cmd=${1:-}
  (( $# )) && shift
  local root file
  root=$(project_root)
  file=$root/$REL
  case $cmd in
    path) print -r -- $file ;;
    list)
      [[ -r $file ]] || return 0
      local line k
      while IFS= read -r line; do
        [[ $line == *_USER=* ]] || continue
        k=${line%%_USER=*}
        k=${(L)k}
        print -r -- ${k//_/-}
      done < $file
      ;;
    has)
      check_slug ${1:-}
      value $file $(key_prefix $1)_USER >/dev/null && value $file $(key_prefix $1)_PASS >/dev/null
      ;;
    user)
      check_slug ${1:-}
      local pre u url
      pre=$(key_prefix $1)
      u=$(value $file ${pre}_USER) || fail "no saved login for $1"
      url=$(value $file ${pre}_URL)
      print -r -- "user=$u"
      [[ -n $url ]] && print -r -- "url=$url"
      return 0
      ;;
    set) check_slug ${1:-}; cmd_set "$@" ;;
    fill) check_slug ${1:-}; cmd_fill "$@" ;;
    ''|-h|--help) sed -n '3,15p' $SELF | sed 's/^# \{0,1\}//' ;;
    *) fail "unknown command: $cmd (path, list, has, user, set, fill)" ;;
  esac
}

main "$@"
