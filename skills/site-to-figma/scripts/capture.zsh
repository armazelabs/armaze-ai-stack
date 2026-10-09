#!/usr/bin/env zsh
#
# capture.zsh - capture the page in an Orca browser tab into a Figma file, using Figma's own
# capture script (the one generate_figma_design hands out) without needing Playwright.
#
#   zsh <skill>/scripts/capture.zsh --page <browserPageId> --capture-id <id> --endpoint <url> [--selector <css>]
#
# <id> and <url> come from a generate_figma_design call on the target file: the endpoint is the
# https://mcp.figma.com/mcp/capture/<id>/submit?... address in its instructions. Then poll
# generate_figma_design with the capture id until it reports completed.
#
# Most sites' Content-Security-Policy stops a page from posting to figma.com, so the script is
# run in the tab with its upload caught, and the upload is sent from here with curl instead.
# The tab is reloaded afterwards to clear the capture toolbar.

emulate -R zsh
setopt pipe_fail extended_glob typeset_silent

readonly SELF=${0:A}
readonly DIR=${SELF:h}
readonly CAPTURE_JS=https://mcp.figma.com/mcp/html-to-design/capture.js

fail() { print -r -u2 -- "capture: $*"; exit 1 }

orca_bin() {
  local o
  o=$(command -v orca 2>/dev/null) && { print -r -- $o; return }
  o=/Applications/Orca.app/Contents/Resources/bin/orca
  [[ -x $o ]] && { print -r -- $o; return }
  return 1
}

main() {
  local page= id= endpoint= selector=body
  while (( $# )); do
    case $1 in
      --page) page=${2:-}; shift 2 || fail "--page needs an id" ;;
      --capture-id) id=${2:-}; shift 2 || fail "--capture-id needs an id" ;;
      --endpoint) endpoint=${2:-}; shift 2 || fail "--endpoint needs a URL" ;;
      --selector) selector=${2:-}; shift 2 || fail "--selector needs a CSS selector" ;;
      -h|--help) sed -n '3,15p' $SELF | sed 's/^# \{0,1\}//'; return 0 ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  [[ -n $page && -n $id && -n $endpoint ]] || fail "give --page, --capture-id and --endpoint (from generate_figma_design)"
  [[ $id == [A-Za-z0-9-]## ]] || fail "unexpected capture id: $id"
  [[ $endpoint == https://mcp.figma.com/mcp/capture/* ]] || fail "the endpoint must be https://mcp.figma.com/mcp/capture/...: $endpoint"
  [[ $selector != *[\'\\]* ]] || fail "no quotes or backslashes in --selector"
  local orca
  orca=$(orca_bin) || fail "the orca CLI was not found; open Orca, or put its bin/ on PATH"

  local tmp
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/stf-capture.XXXXXX") || fail "cannot make a temp folder"
  trap "rm -rf -- ${(q)tmp}" EXIT

  curl -fsSL -o $tmp/capture.js $CAPTURE_JS || fail "could not download $CAPTURE_JS"
  [[ -s $tmp/capture.js ]] || fail "empty capture script"

  # The capture needs a painting tab: bring it on screen in Orca (a hidden pane never runs
  # animation frames or observers, and the capture would stall).
  $orca tab switch --page $page --focus --json >/dev/null 2>&1
  # lazy images and scroll-triggered sections first
  $orca eval --expression "$(<$DIR/scroll.js)" --page $page >/dev/null 2>&1

  # Before the script: if the tab still is not painted, requestAnimationFrame never fires and
  # the capture would stall, so a timer stands in for it. The upload to figma.com is caught so it can be sent from here.
  local pre="(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.__stfBody = null; window.__stfErr = null; window.__stfUrl = null;
  const realFetch = window.fetch;
  window.fetch = function (u, init) {
    const url = String((u && u.url) || u);
    if (/^https:\\/\\/mcp\\.figma\\.com\\/mcp\\/capture\\//.test(url) && init && String(init.method).toUpperCase() === 'POST') {
      window.__stfBody = init.body;
      window.__stfUrl = url;
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch.apply(this, arguments);
  };
})();
"
  local hook="
;(() => {
  if (!window.figma || !window.figma.captureForDesign) return 'no-capture-api';
  window.figma.captureForDesign({ captureId: '$id', endpoint: '$endpoint', selector: '$selector' })
    .then((r) => { if (r && r.success === false && !window.__stfBody) window.__stfErr = r.error || 'capture failed'; })
    .catch((e) => { window.__stfErr = String(e); });
  return 'started';
})()"
  local res
  res=$($orca eval --expression "$pre$(<$tmp/capture.js)$hook" --page $page 2>&1)
  [[ $res == *started* ]] || fail "could not start the capture: ${res[1,300]}"

  # wait for the upload to be caught (big pages take a while to serialise)
  local i state
  for i in {1..90}; do
    state=$($orca eval --expression 'window.__stfErr ? "error:" + window.__stfErr : (window.__stfBody ? "ready:" + window.__stfBody.length : "waiting")' --page $page 2>&1)
    [[ $state == ready:* || $state == error:* ]] && break
    perl -e 'select(undef,undef,undef,2)'
  done
  [[ $state == error:* ]] && fail "the capture failed in the page: ${state#error:}"
  [[ $state == ready:* ]] || fail "no capture after 3 minutes (state: $state)"

  local url
  url=$($orca eval --expression 'window.__stfUrl' --page $page 2>&1)
  [[ $url == https://mcp.figma.com/mcp/capture/* ]] || fail "unexpected upload address: ${url[1,200]}"
  $orca eval --expression 'window.__stfBody' --page $page > $tmp/body.json 2>/dev/null || fail "could not read the capture out of the page"
  [[ $(head -c 1 $tmp/body.json) == '{' ]] || fail "the capture read back is not JSON"

  local code
  code=$(curl -sS -o $tmp/response.txt -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary @$tmp/body.json "$url") || fail "upload failed"
  $orca reload --page $page --json >/dev/null 2>&1
  [[ $code == 2* ]] || fail "Figma refused the upload (HTTP $code): $(head -c 300 $tmp/response.txt)"
  print -r -- "uploaded the capture ($(( $(wc -c < $tmp/body.json) / 1024 )) KB); now poll generate_figma_design with captureId $id"
}

main "$@"
