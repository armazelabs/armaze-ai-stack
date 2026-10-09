// ---- step: swap (figma-code.zsh puts NODE_IDS and SET_ID above) ----------------------------------
// After rebind: replaces captured button layers with instances of the Button component set, but
// only where it is sure. A layer qualifies when its fill is the same colour as a variant's fill
// (the default mode's value), its height is within 2px of that variant, its corner radius matches, and it
// holds exactly one text layer (plus at most one icon). The instance takes the layer's place and
// label. Everything else is left as captured.
const set = await figma.getNodeByIdAsync(SET_ID);
if (!set || (set.type !== 'COMPONENT_SET' && set.type !== 'COMPONENT')) throw new Error(`no Button component set with id ${SET_ID}`);
const roots = (await Promise.all(NODE_IDS.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean);
if (!roots.length) throw new Error(`none of these nodes exist: ${NODE_IDS.join(', ')}`);
let pg = roots[0];
while (pg && pg.type !== 'PAGE') pg = pg.parent;
await figma.setCurrentPageAsync(pg);

const variants = (set.type === 'COMPONENT_SET' ? set.children : [set]).filter((v) => !/State=hover/.test(v.name));
const fillVar = (n) => {
  const f = Array.isArray(n.fills) && n.fills.find((p) => p.type === 'SOLID' && p.visible !== false);
  if (!f) return null;
  const x = (v) => Math.round(v * 255);
  return [x(f.color.r), x(f.color.g), x(f.color.b), Math.round((f.opacity === undefined ? 1 : f.opacity) * 100)].join(',');
};
const radiusOf = (n) => (typeof n.cornerRadius === 'number' ? n.cornerRadius : null);
const vinfo = variants.map((v) => ({ v, fill: fillVar(v), h: v.height, r: radiusOf(v), full: radiusOf(v) >= v.height / 2 - 0.5 })).filter((x) => x.fill);
const labelKey = Object.keys(set.componentPropertyDefinitions).find((k) => k.startsWith('Label'));
const fonts = new Map();
for (const v of variants) for (const t of v.findAllWithCriteria({ types: ['TEXT'] })) if (t.fontName !== figma.mixed) fonts.set(JSON.stringify(t.fontName), t.fontName);
await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));

const swapped = {};
const ids = [];
const candidates = roots.flatMap((r) => ('findAll' in r ? r.findAll((n) => n.type === 'FRAME') : []));
for (const n of candidates) {
  if (n.removed || !n.parent) continue;
  const fv = fillVar(n);
  if (!fv) continue;
  const texts = n.findAllWithCriteria({ types: ['TEXT'] });
  if (texts.length !== 1) continue;
  // besides the label (and a frame that only wraps it), allow a small icon's worth of layers
  const extra = n.findAll((d) => d.type !== 'TEXT' && !(d.type === 'FRAME' && d.children.length === 1 && d.children[0].type === 'TEXT'));
  if (extra.length > 4) continue;
  const r = radiusOf(n);
  const hit = vinfo.find((x) => x.fill === fv && Math.abs(x.h - n.height) <= 2 &&
    (r === null ? false : x.full ? r >= n.height / 2 - 1 : Math.abs(r - x.r) <= 1));
  if (!hit) continue;
  const label = texts[0].characters;
  const inst = hit.v.createInstance();
  if (labelKey) inst.setProperties({ [labelKey]: label });
  const parent = n.parent;
  const i = parent.children.indexOf(n);
  parent.insertChild(i, inst);
  const auto = 'layoutMode' in parent && parent.layoutMode !== 'NONE';
  if (auto && n.layoutPositioning === 'ABSOLUTE') inst.layoutPositioning = 'ABSOLUTE';
  if (!auto || n.layoutPositioning === 'ABSOLUTE') { inst.x = n.x; inst.y = n.y; }
  n.remove();
  swapped[hit.v.name] = (swapped[hit.v.name] || 0) + 1;
  ids.push(inst.id);
}
return { swapped, instanceIds: ids.slice(0, 50), total: ids.length };
