// ---- step: rebind (figma-code.zsh puts NODE_IDS above) -------------------------------------------
// Walks a captured page (generate_figma_design output) and ties its raw values to the design
// system: solid fills and strokes to colour variables (a meaning whose scope fits first, then a
// primitive), text to the matching text style, shadows to effect styles, corner radii and
// auto-layout spacing to Size variables. Only exact matches are bound; the rest is counted.
// Colours the capture already bound (it binds to this file's variables itself) are kept.
const out = { nodes: 0, fills: 0, strokes: 0, alreadyBound: 0, textStyles: 0, effects: 0, radii: 0, spacing: 0, textSkippedFonts: 0 };
const unmatched = {};
const roots = (await Promise.all(NODE_IDS.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean);
if (!roots.length) throw new Error(`none of these nodes exist: ${NODE_IDS.join(', ')}`);
let pg = roots[0];
while (pg && pg.type !== 'PAGE') pg = pg.parent;
await figma.setCurrentPageAsync(pg);

const cols = await figma.variables.getLocalVariableCollectionsAsync();
const colName = Object.fromEntries(cols.map((c) => [c.id, c]));
const V = await varMap();
const componentToken = new Set((SPEC.semantic || []).filter((t) => t.component).map((t) => t.name));
const resolve = async (v, depth = 0) => {
  const c = colName[v.variableCollectionId];
  const val = v.valuesByMode[c.defaultModeId];
  if (val && val.type === 'VARIABLE_ALIAS') {
    const t = await figma.variables.getVariableByIdAsync(val.id);
    return t && depth < 6 ? resolve(t, depth + 1) : null;
  }
  return val;
};
const entries = Object.entries(V);
const values = await Promise.all(entries.map(([, v]) => resolve(v)));
const colorVars = [], floatVars = [];
entries.forEach(([name, v], i) => {
  const val = values[i];
  if (val === null || val === undefined) return;
  const col = colName[v.variableCollectionId].name;
  if (v.resolvedType === 'COLOR' && !componentToken.has(name)) colorVars.push({ name, v, c: val, primitive: col === 'Primitives', scopes: v.scopes });
  if (v.resolvedType === 'FLOAT') floatVars.push({ name, v, px: val });
});
const PURPOSE = { text: ['TEXT_FILL', 'ALL_FILLS'], fill: ['FRAME_FILL', 'SHAPE_FILL', 'ALL_FILLS'], stroke: ['STROKE_COLOR'] };
const matchColor = (color, opacity, purpose) => {
  const a = opacity === undefined ? 1 : opacity;
  const hits = colorVars.filter((x) => Math.abs(x.c.r - color.r) <= 1.6 / 255 && Math.abs(x.c.g - color.g) <= 1.6 / 255 && Math.abs(x.c.b - color.b) <= 1.6 / 255 && Math.abs((x.c.a === undefined ? 1 : x.c.a) - a) <= 0.02);
  if (!hits.length) return null;
  const fits = (x) => x.scopes.some((s) => PURPOSE[purpose].includes(s));
  // a meaning meant for this kind of layer, else the raw primitive, else any meaning
  return hits.find((x) => !x.primitive && fits(x)) || hits.find((x) => x.primitive) || hits[0];
};
const rebindPaints = (paints, purpose) => {
  let changed = false;
  const next = paints.map((p) => {
    if (p.type !== 'SOLID' || p.visible === false) return p;
    if (p.boundVariables && p.boundVariables.color) { out.alreadyBound++; return p; }
    const m = matchColor(p.color, p.opacity, purpose);
    if (!m) {
      const k = hexOf({ ...p.color, a: p.opacity === undefined ? 1 : p.opacity });
      unmatched[k] = (unmatched[k] || 0) + 1;
      return p;
    }
    changed = true;
    return figma.variables.setBoundVariableForPaint({ ...p, opacity: 1 }, 'color', m.v);
  });
  return changed ? next : null;
};

const radiusVars = floatVars.filter((x) => x.name.startsWith('radius/'));
const spaceVars = floatVars.filter((x) => x.name.startsWith('space/'));
const textStyles = await figma.getLocalTextStylesAsync();
const effectStyles = await figma.getLocalEffectStylesAsync();
const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
const weightOf = (style) => {
  const n = norm(style).replace('italic', '');
  for (const [w, names] of Object.entries(WEIGHT_NAMES)) if (names.some((x) => norm(x) === n)) return +w;
  return 400;
};
const lhPx = (lh, size) => (lh.unit === 'PIXELS' ? lh.value : lh.unit === 'PERCENT' ? (lh.value / 100) * size : null);
const esig = (effects) => effects.filter((e) => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'))
  .map((e) => [e.type, Math.round(e.offset.x), Math.round(e.offset.y), Math.round(e.radius), Math.round(e.spread || 0), hexOf(e.color)].join(',')).join(';');
const effectBySig = Object.fromEntries(effectStyles.map((s) => [esig(s.effects), s]));

const nodes = roots.flatMap((r) => [r, ...('findAll' in r ? r.findAll(() => true) : [])]);
out.nodes = nodes.length;
const textJobs = [];
const fontsNeeded = new Map();
for (const n of nodes) {
  if (n.type === 'INSTANCE' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') continue;
  if ('fills' in n && Array.isArray(n.fills) && n.fills.length) {
    const next = rebindPaints(n.fills, n.type === 'TEXT' ? 'text' : 'fill');
    if (next) { n.fills = next; out.fills++; }
  }
  if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length) {
    const next = rebindPaints(n.strokes, 'stroke');
    if (next) { n.strokes = next; out.strokes++; }
  }
  if ('effects' in n && n.effects.length && !n.effectStyleId) {
    const s = effectBySig[esig(n.effects)];
    if (s) { await n.setEffectStyleIdAsync(s.id); out.effects++; }
  }
  if ('cornerRadius' in n && typeof n.cornerRadius === 'number' && n.cornerRadius > 0 && !(n.boundVariables && n.boundVariables.topLeftRadius)) {
    const full = n.cornerRadius >= Math.min(n.width, n.height) / 2 - 0.5;
    const hit = radiusVars.find((x) => Math.abs(x.px - n.cornerRadius) <= 0.5) || (full && radiusVars.find((x) => x.px >= 999));
    if (hit) { for (const k of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(k, hit.v); out.radii++; }
  }
  if ('layoutMode' in n && n.layoutMode !== 'NONE') {
    for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing']) {
      const val = n[k];
      if (!val || (n.boundVariables && n.boundVariables[k])) continue;
      const hit = spaceVars.find((x) => Math.abs(x.px - val) < 0.01);
      if (hit) { n.setBoundVariable(k, hit.v); out.spacing++; }
    }
  }
  if (n.type === 'TEXT' && !n.textStyleId && n.fontName !== figma.mixed && n.fontSize !== figma.mixed && n.lineHeight !== figma.mixed) {
    const w = weightOf(n.fontName.style);
    const lh = lhPx(n.lineHeight, n.fontSize);
    const cands = textStyles.filter((s) => Math.abs(s.fontSize - n.fontSize) <= 0.5 && Math.abs(weightOf(s.fontName.style) - w) <= 100);
    if (!cands.length) continue;
    const score = (s) => (norm(s.fontName.family) === norm(n.fontName.family) ? 0 : 10) + Math.abs(weightOf(s.fontName.style) - w) / 50 +
      (lh === null || lhPx(s.lineHeight, s.fontSize) === null ? 1 : Math.abs(lhPx(s.lineHeight, s.fontSize) - lh));
    const best = cands.sort((a, b) => score(a) - score(b))[0];
    textJobs.push([n, best]);
    fontsNeeded.set(JSON.stringify(n.fontName), n.fontName);
    fontsNeeded.set(JSON.stringify(best.fontName), best.fontName);
  }
}
const loaded = new Set();
await Promise.all([...fontsNeeded.entries()].map(([k, f]) => figma.loadFontAsync(f).then(() => loaded.add(k), () => null)));
// A captured text node whose font Figma lacks (the site's own font name) can still take a style
// whose font is loaded; try each and count what Figma refuses.
const ready = textJobs.filter(([, s]) => loaded.has(JSON.stringify(s.fontName)));
const results = await Promise.allSettled(ready.map(([n, s]) => n.setTextStyleIdAsync(s.id)));
out.textStyles = results.filter((r) => r.status === 'fulfilled').length;
out.textSkippedFonts = textJobs.length - out.textStyles;

const top = Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([hex, n]) => `${hex} ×${n}`);
return { ...out, unmatchedColours: top };
