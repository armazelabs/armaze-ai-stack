// ---- step: styles -----------------------------------------------------------------------------
// Text styles (one per site type style, in the closest font Figma can load) and effect styles
// (one per shadow). Same rules as variables: create, update our unedited ones, keep the rest.
const out = { created: [], updated: [], kept: [], unchanged: 0, fonts: {} };
const fr = await fontResolver();
const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
const want = SPEC.text.map((t) => {
  const f = specFont(t.family);
  const family = fr.family(f.candidates);
  const style = fr.style(family, t.weight, t.italic);
  const exact = f.candidates.slice(0, 3).some((c) => norm(c) === norm(family));
  out.fonts[t.family] = exact ? family : `${family} (stand-in: the site font is not available in Figma)`;
  return { t, family, style, exact };
});
await Promise.all([...new Set(want.map((w) => JSON.stringify({ family: w.family, style: w.style })))].map((s) => figma.loadFontAsync(JSON.parse(s))));

const caseOf = (tt) => (tt === 'uppercase' ? 'UPPER' : tt === 'lowercase' ? 'LOWER' : tt === 'capitalize' ? 'TITLE' : 'ORIGINAL');
const tsig = (family, style, size, lh, ls, tc) => [family, style, size, lh == null ? 'auto' : lh, ls || 0, tc].join('|');
const curSig = (s) => tsig(s.fontName.family, s.fontName.style, s.fontSize,
  s.lineHeight.unit === 'AUTO' ? null : s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : `${s.lineHeight.value}%`,
  s.letterSpacing.unit === 'PIXELS' ? s.letterSpacing.value : `${s.letterSpacing.value}%`, s.textCase);
const texts = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
for (const { t, family, style, exact } of want) {
  const target = tsig(family, style, t.size, t.lh, t.ls, caseOf(t.tt));
  const desc = `Site: ${t.family} ${t.weight}, ${t.size}px / ${t.lh ? t.lh + 'px' : 'normal'}${exact ? '' : ` (not available in Figma; using ${family} ${style})`}${t.sample ? `. Sample: "${t.sample}"` : ''}. From ${SPEC.site} via site-to-figma.`;
  let s = texts[t.name];
  if (s) {
    const tag = tagOf(s.description);
    const cur = curSig(s);
    if (tag === null) { out.kept.push(`${t.name} (made by hand, left alone)`); continue; }
    if (tag !== cur) { out.kept.push(`${t.name} (edited in Figma, left alone)`); continue; }
    if (cur === target) { out.unchanged++; continue; }
    out.updated.push(`${t.name}: ${cur} -> ${target}`);
  } else {
    s = figma.createTextStyle();
    s.name = t.name;
    out.created.push(t.name);
  }
  s.fontName = { family, style };
  s.fontSize = t.size;
  s.lineHeight = t.lh ? { unit: 'PIXELS', value: t.lh } : { unit: 'AUTO' };
  s.letterSpacing = { unit: 'PIXELS', value: t.ls || 0 };
  s.textCase = caseOf(t.tt);
  s.description = withTag(desc, target);
}

const esig = (layers) => layers.map((l) => [l.x, l.y, l.blur, l.spread, l.hex.toLowerCase(), l.inset ? 1 : 0].join(',')).join(';');
const curEsig = (s) => esig(s.effects.filter((e) => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW').map((e) => ({
  x: e.offset.x, y: e.offset.y, blur: e.radius, spread: e.spread || 0, hex: hexOf(e.color), inset: e.type === 'INNER_SHADOW',
})));
const effects = Object.fromEntries((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
for (const sh of SPEC.shadows) {
  const target = esig(sh.layers);
  let s = effects[sh.name];
  if (s) {
    const tag = tagOf(s.description);
    const cur = curEsig(s);
    if (tag === null) { out.kept.push(`${sh.name} (made by hand, left alone)`); continue; }
    if (tag !== cur) { out.kept.push(`${sh.name} (edited in Figma, left alone)`); continue; }
    if (cur === target) { out.unchanged++; continue; }
    out.updated.push(`${sh.name}: ${cur} -> ${target}`);
  } else {
    s = figma.createEffectStyle();
    s.name = sh.name;
    out.created.push(sh.name);
  }
  s.effects = sh.layers.map((l) => ({
    type: l.inset ? 'INNER_SHADOW' : 'DROP_SHADOW', color: rgba(l.hex), offset: { x: l.x, y: l.y },
    radius: l.blur, spread: l.spread, visible: true, blendMode: 'NORMAL',
  }));
  s.description = withTag(`From ${SPEC.site} via site-to-figma.`, target);
}

return { created: out.created, updated: out.updated, kept: out.kept, unchanged: out.unchanged, fonts: out.fonts };
