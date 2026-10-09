// ---- step: foundations ------------------------------------------------------------------------
// A documentation board on the "Foundations" page: colour meanings shown once per theme (each
// panel switched to its mode), the palette, every text style, spacing, radius and shadows, all
// bound to the variables and styles. The board is generated output: it is rebuilt each run.
const NAME = 'site-to-figma · Foundations';
const V = await varMap();
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const colorCol = cols.find((c) => c.name === 'Color');
const TS = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
const ES = Object.fromEntries((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
const INTER = ['Regular', 'Medium', 'Bold'].map((style) => ({ family: 'Inter', style }));
const styleFonts = [...new Set(SPEC.text.map((t) => TS[t.name]).filter(Boolean).map((s) => JSON.stringify(s.fontName)))].map((s) => JSON.parse(s));
await Promise.all([...INTER, ...styleFonts].map((f) => figma.loadFontAsync(f)));

const page = await findPage('Foundations');
await figma.setCurrentPageAsync(page);
let oldX = null, oldY = null;
for (const n of page.children.filter((n) => n.name === NAME)) { oldX = n.x; oldY = n.y; n.remove(); }

const bound = (name) => (V[name] ? [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[name])] : null);
const txt = (chars, size = 12, style = 'Regular', fill = '#1f1f1f') => {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style };
  t.fontSize = size;
  t.characters = String(chars);
  t.fills = typeof fill === 'string' && fill.startsWith('#') ? [solid(fill)] : bound(fill) || [solid('#1f1f1f')];
  return t;
};
const stack = (dir, props) => figma.createAutoLayout(dir, props);
const wrap = (width, gap = 16) => {
  const r = figma.createAutoLayout('HORIZONTAL', { itemSpacing: gap });
  r.layoutWrap = 'WRAP';
  r.counterAxisSpacing = gap;
  r.resize(width, 10);
  r.primaryAxisSizingMode = 'FIXED';
  r.counterAxisSizingMode = 'AUTO';
  r.fills = [];
  return r;
};
const W = 1200;
const root = stack('VERTICAL', { name: NAME, itemSpacing: 64, paddingTop: 80, paddingBottom: 80, paddingLeft: 80, paddingRight: 80 });
root.fills = [solid('#ffffff')];
root.cornerRadius = 24;
const section = (title, note) => {
  const s = stack('VERTICAL', { itemSpacing: 24 });
  s.fills = [];
  root.appendChild(s);
  s.appendChild(txt(title, 28, 'Bold'));
  if (note) s.appendChild(txt(note, 14, 'Regular', '#666666'));
  return s;
};
root.appendChild(txt(`${SPEC.title} design system`, 48, 'Bold'));
root.appendChild(txt(`Extracted from ${SPEC.site} on ${SPEC.date} (pages: ${SPEC.pages.map((p) => p.name).join(', ')}). Built by site-to-figma.`, 16, 'Regular', '#666666'));

// colour meanings, one panel per theme
const meanings = SPEC.semantic.filter((t) => !t.component);
const comps = SPEC.semantic.filter((t) => t.component);
const primHex = Object.fromEntries(SPEC.primitives.map((p) => [p.name, p.hex]));
const sCol = section('Colour meanings', SPEC.modes.length > 1 ? 'Each panel uses its own mode of the Color collection.' : null);
const themes = stack('HORIZONTAL', { itemSpacing: 24 });
themes.fills = [];
sCol.appendChild(themes);
const panelW = SPEC.modes.length > 1 ? (W - 24) / 2 : W;
SPEC.modes.forEach((mode, mi) => {
  const p = stack('VERTICAL', { itemSpacing: 20, paddingTop: 32, paddingBottom: 32, paddingLeft: 32, paddingRight: 32, name: mode });
  p.fills = bound('surface/page') || [solid('#ffffff')];
  p.strokes = [solid('#e5e5e5')];
  p.cornerRadius = 16;
  themes.appendChild(p);
  if (colorCol) p.setExplicitVariableModeForCollection(colorCol, colorCol.modes.find((m) => m.name === mode).modeId);
  p.appendChild(txt(mode, 16, 'Bold', 'text/primary'));
  const g = wrap(panelW - 64, 16);
  p.appendChild(g);
  for (const t of [...meanings, ...comps]) {
    const sw = stack('VERTICAL', { itemSpacing: 6 });
    sw.fills = [];
    const r = figma.createRectangle();
    r.resize(122, 56);
    r.cornerRadius = 8;
    r.fills = bound(t.name) || [solid('#ff00ff')];
    r.strokes = [solid('#8080803d')];
    sw.appendChild(r);
    sw.appendChild(txt(t.name, 11, 'Medium', 'text/primary'));
    const ref = mi === 0 ? t.light : t.dark || t.light;
    sw.appendChild(txt(`${ref} ${primHex[ref] || ''}`, 10, 'Regular', 'text/primary'));
    g.appendChild(sw);
  }
});

// palette
const sPal = section('Palette', 'Primitives: every distinct colour the site uses, by hue and lightness. Hidden from the colour pickers; use the colour meanings instead.');
const fams = {};
for (const p of SPEC.primitives) { const f = p.name.includes('/') ? p.name.split('/')[0] : p.name; (fams[f] || (fams[f] = [])).push(p); }
for (const [f, list] of Object.entries(fams)) {
  const row = stack('HORIZONTAL', { itemSpacing: 12 });
  row.fills = [];
  const lab = txt(f, 13, 'Medium');
  lab.textAutoResize = 'HEIGHT';
  lab.resize(90, lab.height);
  row.appendChild(lab);
  const g = wrap(W - 102, 10);
  row.appendChild(g);
  for (const p of list) {
    const sw = stack('VERTICAL', { itemSpacing: 4 });
    sw.fills = [];
    const r = figma.createRectangle();
    r.resize(76, 48);
    r.cornerRadius = 6;
    r.fills = bound(p.name) || [solid(p.hex)];
    r.strokes = [solid('#8080803d')];
    sw.appendChild(r);
    sw.appendChild(txt(p.name.split('/').slice(1).join('/') || p.name, 10, 'Medium'));
    sw.appendChild(txt(p.hex, 9, 'Regular', '#666666'));
    g.appendChild(sw);
  }
  sPal.appendChild(row);
}

// typography
const sType = section('Text styles', null);
for (const t of SPEC.text) {
  const st = TS[t.name];
  const row = stack('HORIZONTAL', { itemSpacing: 32 });
  row.fills = [];
  const meta = stack('VERTICAL', { itemSpacing: 4 });
  meta.fills = [];
  meta.appendChild(txt(t.name, 13, 'Medium'));
  meta.appendChild(txt(st ? `${st.fontName.family} ${st.fontName.style}` : t.family, 11, 'Regular', '#666666'));
  meta.appendChild(txt(`${t.size}px / ${t.lh ? t.lh + 'px' : 'auto'}${t.ls ? ` · ${t.ls}px` : ''}`, 11, 'Regular', '#666666'));
  meta.resize(240, meta.height);
  meta.primaryAxisSizingMode = 'AUTO';
  meta.counterAxisSizingMode = 'FIXED';
  row.appendChild(meta);
  const sample = figma.createText();
  sample.fontName = { family: 'Inter', style: 'Regular' };
  if (st) await sample.setTextStyleIdAsync(st.id);
  sample.characters = t.sample || 'The quick brown fox jumps over the lazy dog';
  sample.fills = bound('text/primary') || [solid('#111111')];
  sample.textAutoResize = 'HEIGHT';
  sample.resize(W - 272, sample.height);
  row.appendChild(sample);
  sType.appendChild(row);
}

// spacing
const sSpace = section('Spacing', null);
for (const s of SPEC.space) {
  const row = stack('HORIZONTAL', { itemSpacing: 16, counterAxisAlignItems: 'CENTER' });
  row.fills = [];
  const lab = txt(`${s.name}  ${s.px}px`, 12, 'Medium');
  lab.textAutoResize = 'HEIGHT';
  lab.resize(140, lab.height);
  row.appendChild(lab);
  const bar = figma.createRectangle();
  bar.resize(Math.max(1, s.px), 16);
  bar.fills = bound('brand/primary') || [solid('#3b82f6')];
  if (V[s.name]) bar.setBoundVariable('width', V[s.name]);
  row.appendChild(bar);
  sSpace.appendChild(row);
}

// radius
const sRad = section('Radius', null);
const rg = wrap(W, 24);
sRad.appendChild(rg);
for (const r of SPEC.radius) {
  const sw = stack('VERTICAL', { itemSpacing: 8 });
  sw.fills = [];
  const box = figma.createRectangle();
  box.resize(88, 88);
  box.fills = [solid('#ededed')];
  box.strokes = [solid('#d4d4d4')];
  if (V[r.name]) for (const k of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) box.setBoundVariable(k, V[r.name]);
  sw.appendChild(box);
  sw.appendChild(txt(`${r.name}  ${r.px === 9999 ? 'full' : r.px + 'px'}`, 11, 'Medium'));
  rg.appendChild(sw);
}

// shadows
if (SPEC.shadows.length) {
  const sSh = section('Shadows', null);
  const sg = wrap(W, 40);
  sg.paddingTop = sg.paddingBottom = sg.paddingLeft = sg.paddingRight = 32;
  sg.fills = [solid('#f5f5f5')];
  sg.cornerRadius = 16;
  sSh.appendChild(sg);
  for (const sh of SPEC.shadows) {
    const card = stack('VERTICAL', { paddingTop: 20, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });
    card.resize(180, 110);
    card.primaryAxisSizingMode = 'FIXED';
    card.counterAxisSizingMode = 'FIXED';
    card.fills = [solid('#ffffff')];
    card.cornerRadius = 12;
    if (ES[sh.name]) await card.setEffectStyleIdAsync(ES[sh.name].id);
    card.appendChild(txt(sh.name, 12, 'Medium'));
    sg.appendChild(card);
  }
}

// place the board where the old one was, else right of everything on the page
if (oldX !== null) { root.x = oldX; root.y = oldY; } else {
  const others = page.children.filter((n) => n !== root);
  root.x = others.length ? Math.max(...others.map((n) => n.x + n.width)) + 200 : 0;
  root.y = 0;
}
figma.viewport.scrollAndZoomIntoView([root]);
return { pageId: page.id, boardId: root.id, meanings: meanings.length, componentColours: comps.length, palette: SPEC.primitives.length, textStyles: SPEC.text.length, missingStyles: SPEC.text.filter((t) => !TS[t.name]).map((t) => t.name) };
