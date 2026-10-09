// ---- step: variables ----------------------------------------------------------------------
// Collections: Primitives (raw palette, hidden from pickers), Color (meanings, one mode per
// theme, aliasing Primitives), Size (space/*, radius/*), Typography (font families).
// Creates what is missing, updates what this tool wrote before and nobody has edited since,
// and keeps everything else. Never deletes.
const out = { created: [], updated: [], kept: [], unchanged: 0, stale: [], notes: [] };
const fr = await fontResolver();
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const ensureCol = (name, modeNames) => {
  let c = cols.find((x) => x.name === name);
  if (!c) {
    c = figma.variables.createVariableCollection(name);
    cols.push(c);
  }
  if (c.modes.length === 1 && /^Mode 1$/.test(c.modes[0].name)) c.renameMode(c.modes[0].modeId, modeNames[0]);
  for (const m of modeNames.slice(1)) {
    if (c.modes.find((x) => x.name === m)) continue;
    try { c.addMode(m); } catch (e) { out.notes.push(`${name}: could not add the ${m} mode (${e.message})`); }
  }
  return c;
};
const modeId = (c, name) => (c.modes.find((m) => m.name === name) || c.modes[0]).modeId;

const prim = ensureCol('Primitives', ['Value']);
const color = ensureCol('Color', SPEC.modes);
let darkCol = null;
if (SPEC.modes.length > 1 && !color.modes.find((m) => m.name === SPEC.modes[1])) {
  darkCol = ensureCol('Color (Dark)', [SPEC.modes[1]]);
  out.notes.push(`This Figma plan allows one mode per collection, so the ${SPEC.modes[1]} values went into the "Color (Dark)" collection.`);
}
const size = ensureCol('Size', ['Value']);
const typo = ensureCol('Typography', ['Value']);

const all = await figma.variables.getLocalVariablesAsync();
const idx = {};
const nameById = {};
for (const v of all) { idx[v.variableCollectionId + '|' + v.name] = v; nameById[v.id] = v.name; }

const fmtVal = (val) => {
  if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') return '@' + (nameById[val.id] || val.id);
  if (val && typeof val === 'object' && 'r' in val) return hexOf(val);
  return String(val);
};
const sigOf = (v, c) => c.modes.map((m) => fmtVal(v.valuesByMode[m.modeId])).join('|');
// wanted: {modeName: {hex}|{alias}|number|string}
const wantSig = (c, wanted) => {
  const first = Object.values(wanted)[0];
  return c.modes.map((m) => {
    const w = wanted[m.name] !== undefined ? wanted[m.name] : first;
    return w && w.alias ? '@' + w.alias : w && w.hex ? hexOf(rgba(w.hex)) : String(w);
  }).join('|');
};
const primByName = {};
const toValue = (w) => {
  if (w && w.alias) {
    const p = primByName[w.alias];
    if (!p) throw new Error(`primitive ${w.alias} is missing`);
    return { type: 'VARIABLE_ALIAS', id: p.id };
  }
  if (w && w.hex) return rgba(w.hex);
  return w;
};
const write = (v, c, wanted) => {
  const first = Object.values(wanted)[0];
  for (const m of c.modes) v.setValueForMode(m.modeId, toValue(wanted[m.name] !== undefined ? wanted[m.name] : first));
};
const ours = new Set();
const upsert = (c, name, type, wanted, scopes, css, about) => {
  const target = wantSig(c, wanted);
  let v = idx[c.id + '|' + name];
  ours.add(c.id + '|' + name);
  const desc = `${about || ''}${about ? '. ' : ''}From ${SPEC.site} via site-to-figma.`;
  if (!v) {
    v = figma.variables.createVariable(name, c, type);
    write(v, c, wanted);
    v.scopes = scopes;
    v.setVariableCodeSyntax('WEB', css ? (css.startsWith('--') ? `var(${css})` : css) : cssName(name));
    v.description = withTag(desc, target);
    nameById[v.id] = name;
    out.created.push(name);
    return v;
  }
  const cur = sigOf(v, c);
  const tag = tagOf(v.description);
  if (tag === null) { out.kept.push(`${name} (made by hand, left alone)`); return v; }
  if (cur !== tag) { out.kept.push(`${name} (edited in Figma, left alone)`); return v; }
  if (cur === target) { out.unchanged++; return v; }
  write(v, c, wanted);
  v.description = withTag(desc, target);
  out.updated.push(`${name}: ${cur} -> ${target}`);
  return v;
};

for (const p of SPEC.primitives) {
  primByName[p.name] = upsert(prim, p.name, 'COLOR', { Value: { hex: p.hex } }, [], p.css, null);
}
const scopesFor = (name) => {
  if (/(^text\/|\/fg|\/on-|placeholder)/.test(name)) return ['TEXT_FILL'];
  if (/(^border\/|\/border)/.test(name)) return ['STROKE_COLOR'];
  if (/(^surface\/|\/bg)/.test(name)) return ['FRAME_FILL', 'SHAPE_FILL'];
  return ['ALL_FILLS', 'STROKE_COLOR'];
};
for (const t of SPEC.semantic) {
  const about = t.component ? 'Component colour' : t.inferred ? 'Guessed from the hue; check it' : '';
  if (darkCol) {
    upsert(color, t.name, 'COLOR', { [SPEC.modes[0]]: { alias: t.light } }, scopesFor(t.name), null, about);
    upsert(darkCol, t.name, 'COLOR', { [SPEC.modes[1]]: { alias: t.dark || t.light } }, scopesFor(t.name), null, about);
  } else {
    const wanted = { [SPEC.modes[0]]: { alias: t.light } };
    if (SPEC.modes[1]) wanted[SPEC.modes[1]] = { alias: t.dark || t.light };
    upsert(color, t.name, 'COLOR', wanted, scopesFor(t.name), null, about);
  }
}
for (const s of SPEC.space) upsert(size, s.name, 'FLOAT', { Value: s.px }, ['GAP'], null, null);
for (const r of SPEC.radius) upsert(size, r.name, 'FLOAT', { Value: r.px }, ['CORNER_RADIUS'], null, null);
const fontKeys = {};
for (const f of SPEC.fonts) {
  let key = f.roles.includes('mono') ? 'mono' : f.roles.includes('body') ? 'sans' : f.roles.includes('heading') ? 'heading' : 'sans';
  if (fontKeys[key]) key = `${key}-${f.family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  fontKeys[key] = 1;
  const resolved = fr.family(f.candidates);
  upsert(typo, `font/${key}`, 'STRING', { Value: resolved }, ['FONT_FAMILY'], null, `Site font: ${f.family}`);
}

for (const v of all) {
  const key = v.variableCollectionId + '|' + v.name;
  if (!ours.has(key) && tagOf(v.description) !== null && [prim.id, color.id, size.id, typo.id, darkCol && darkCol.id].includes(v.variableCollectionId)) out.stale.push(v.name);
}

return {
  collections: cols.filter((c) => ['Primitives', 'Color', 'Color (Dark)', 'Size', 'Typography'].includes(c.name)).map((c) => ({ name: c.name, id: c.id, modes: c.modes.map((m) => m.name), variables: c.variableIds.length })),
  created: out.created.length, createdSample: out.created.slice(0, 12), updated: out.updated, kept: out.kept, unchanged: out.unchanged,
  noLongerOnSite: out.stale, notes: out.notes,
};
