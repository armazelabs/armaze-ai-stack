/*
 * merge-assets.js - run inside a browser page (orca eval) by synth.zsh, once per
 * scanned page. Pure computation.
 *
 * Called as (merge)(acc, next): acc is the assets.jsonl records so far, as an array
 * ([] at first), next is one page's extract-assets.js result. Returns the new assets.jsonl text:
 * line 1 is {"logo": ...} (an SVG logo beats an image one), then one icon per line,
 * de-duplicated by markup, with unique names and summed use counts.
 */
((acc, next) => {
  const lines = (acc || []).slice();
  let logo = lines.length && lines[0].logo ? lines.shift().logo : { kind: 'none' };
  const icons = lines;
  const nl = (next && next.logo) || { kind: 'none' };
  if (logo.kind === 'none' || (logo.kind === 'img' && nl.kind === 'svg')) logo = nl;
  const key = (svg) => svg.replace(/\s(width|height)="[^"]*"/g, '');
  const byKey = new Map(icons.map((ic) => [key(ic.svg), ic]));
  const names = new Set(icons.map((ic) => ic.name));
  for (const ic of (next && next.icons) || []) {
    const k = key(ic.svg);
    if (byKey.has(k)) { byKey.get(k).n += ic.n; continue; }
    let name = ic.name;
    for (let i = 2; names.has(name); i++) name = `${ic.name}-${i}`;
    names.add(name);
    const rec = { name, svg: ic.svg, w: ic.w, h: ic.h, n: ic.n };
    byKey.set(k, rec);
    icons.push(rec);
  }
  icons.sort((a, b) => b.n - a.n);
  // unnamed icons are numbered by how often they are used: icon-1 is the most common
  let k = 0;
  const taken = new Set(icons.filter((ic) => !/^icon-\d+(-\d+)?$/.test(ic.name)).map((ic) => ic.name));
  for (const ic of icons) {
    if (!/^icon-\d+(-\d+)?$/.test(ic.name)) continue;
    do { k++; } while (taken.has(`icon-${k}`));
    ic.name = `icon-${k}`;
  }
  return [JSON.stringify({ logo }), ...icons.map((ic) => JSON.stringify(ic))].join('\n');
})
