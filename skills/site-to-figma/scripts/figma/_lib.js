// ---- site-to-figma shared helpers (figma-code.zsh puts this after `const SPEC = ...`) ----
// Everything this tool creates carries a [stf:<value>] tag in its description: the value it
// last wrote. On a re-run, an item whose current value still equals its tag is updated; one
// that differs was edited in Figma and is kept; one without a tag is not ours and is kept.
const TAG = /\s*\[stf:([^\]]*)\]\s*$/;
const tagOf = (desc) => { const m = (desc || '').match(TAG); return m ? m[1] : null; };
const withTag = (desc, sig) => `${(desc || '').replace(TAG, '')} [stf:${sig}]`.trim();

const rgba = (hex) => {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
};
const hexOf = (c) => {
  const x = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
  return '#' + x(c.r) + x(c.g) + x(c.b) + (c.a !== undefined && c.a < 0.996 ? x(c.a) : '');
};
const solid = (hex) => { const c = rgba(hex); return { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a }; };
const cssName = (name) => `var(--${name.replace(/[\s/]+/g, '-').toLowerCase()})`;

async function findPage(name) {
  return figma.root.children.find((p) => p.name === name) || Object.assign(figma.createPage(), { name });
}

// name -> variable, over this tool's collections (Color wins over Primitives on a name clash)
async function varMap() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const order = { Color: 0, Size: 1, Typography: 2, Primitives: 3 };
  const colName = Object.fromEntries(cols.map((c) => [c.id, c.name]));
  const best = {};
  for (const v of await figma.variables.getLocalVariablesAsync()) {
    const cn = colName[v.variableCollectionId];
    if (!(cn in order)) continue;
    if (!best[v.name] || order[cn] < order[best[v.name].c]) best[v.name] = { v, c: cn };
  }
  return Object.fromEntries(Object.entries(best).map(([k, x]) => [k, x.v]));
}

// Font family / style resolution against what this Figma session can load
const WEIGHT_NAMES = {
  100: ['Thin', 'Hairline'], 200: ['ExtraLight', 'Extra Light', 'UltraLight', 'Ultra Light'], 300: ['Light'],
  400: ['Regular', 'Normal', 'Book', 'Roman'], 500: ['Medium'], 600: ['SemiBold', 'Semi Bold', 'DemiBold', 'Demi Bold'],
  700: ['Bold'], 800: ['ExtraBold', 'Extra Bold', 'UltraBold', 'Ultra Bold', 'Heavy'], 900: ['Black', 'Heavy'],
};
async function fontResolver() {
  const fam = {};
  for (const f of await figma.listAvailableFontsAsync()) (fam[f.fontName.family] || (fam[f.fontName.family] = [])).push(f.fontName.style);
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const byNorm = {};
  for (const k of Object.keys(fam)) byNorm[norm(k)] = k;
  const family = (candidates) => {
    for (const c of candidates || []) { const k = byNorm[norm(c)]; if (k) return k; }
    return 'Inter';
  };
  const style = (family, weight, italic) => {
    const styles = fam[family] || ['Regular'];
    const w0 = Math.min(900, Math.max(100, Math.round((+weight || 400) / 100) * 100));
    for (const it of italic ? [true, false] : [false]) {
      for (const d of [0, 100, -100, 200, -200, 300, -300, 400, -400, 500, -500]) {
        const names = (WEIGHT_NAMES[w0 + d] || []).map((n) => norm(n + (it ? 'Italic' : '')));
        const hit = styles.find((s) => names.includes(norm(s)) || (it && w0 + d === 400 && norm(s) === 'italic'));
        if (hit) return hit;
      }
    }
    return styles.includes('Regular') ? 'Regular' : styles[0];
  };
  return { family, style, has: (f) => !!fam[f] };
}
const specFont = (family) => (SPEC.fonts || []).find((f) => f.family === family) || { candidates: [family, 'Inter'] };
