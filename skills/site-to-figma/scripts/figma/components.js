// ---- step: components ---------------------------------------------------------------------------
// Button, Input, Badge and Card component sets on the "Components" page, built from the site's
// own samples and bound to the variables, text styles and effect styles. A set that already
// exists is left alone (delete it in Figma to have it rebuilt).
const V = await varMap();
const TS = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
const ES = Object.fromEntries((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
const C = SPEC.components || {};
const styleNames = new Set();
for (const list of Object.values(C)) for (const x of list) for (const k of ['text', 'titleStyle', 'bodyStyle']) if (x[k]) styleNames.add(x[k]);
const fonts = [{ family: 'Inter', style: 'Regular' }, ...[...styleNames].filter((n) => TS[n]).map((n) => TS[n].fontName)];
await Promise.all([...new Set(fonts.map((f) => JSON.stringify(f)))].map((f) => figma.loadFontAsync(JSON.parse(f))));

const page = await findPage('Components');
await figma.setCurrentPageAsync(page);
const existing = new Set(page.children.filter((n) => n.type === 'COMPONENT_SET' || n.type === 'COMPONENT').map((n) => n.name));
const RADII = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
const spacePx = Object.fromEntries([...SPEC.space, ...SPEC.radius].map((s) => [s.name, s.px]));
const pxOf = (ref) => (typeof ref === 'number' ? ref : spacePx[ref] || 0);
const paint = (ref) => {
  if (!ref) return [];
  if (ref.startsWith('#')) return [solid(ref)];
  return V[ref] ? [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[ref])] : [];
};
const num = (node, props, ref) => {
  if (ref === null || ref === undefined) return;
  const v = typeof ref === 'string' ? V[ref] : null;
  for (const p of props) {
    if (v) node.setBoundVariable(p, v);
    else node[p] = pxOf(ref);
  }
};
const text = async (styleName, chars, colorRef) => {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: 'Regular' };
  if (TS[styleName]) await t.setTextStyleIdAsync(TS[styleName].id);
  t.characters = chars || ' ';
  const f = paint(colorRef);
  if (f.length) t.fills = f;
  return t;
};
const box = (spec, s) => {
  // s: the state overrides ({fill, fg, border}) or {}
  const c = figma.createComponent();
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisAlignItems = 'CENTER';
  c.counterAxisAlignItems = 'CENTER';
  c.resize(Math.max(24, spec.w || 80), Math.max(16, spec.h || 32));
  c.primaryAxisSizingMode = 'AUTO';
  c.counterAxisSizingMode = 'FIXED';
  num(c, ['paddingLeft', 'paddingRight'], spec.padX || 0);
  c.paddingTop = c.paddingBottom = 0;
  if (spec.gap) num(c, ['itemSpacing'], spec.gap);
  c.fills = paint(s.fill || spec.fill);
  const border = s.border || spec.border;
  if (border && (spec.bw || s.border)) {
    c.strokes = paint(border);
    c.strokeWeight = spec.bw || 1;
    c.strokeAlign = 'INSIDE';
  }
  num(c, RADII, spec.radius || 0);
  return c;
};
let y = page.children.length ? Math.max(...page.children.map((n) => n.y + n.height)) + 160 : 0;
const place = (node) => { node.x = 0; node.y = y; y += node.height + 160; };
const combine = (comps, name, description, cols) => {
  if (comps.length === 1) {
    comps[0].name = name;
    comps[0].description = description;
    place(comps[0]);
    return comps[0];
  }
  const set = figma.combineAsVariants(comps, page);
  set.name = name;
  set.description = description;
  let x = 40, rowY = 40, rowH = 0, i = 0;
  for (const ch of set.children) {
    if (i > 0 && i % cols === 0) { x = 40; rowY += rowH + 32; rowH = 0; }
    ch.x = x;
    ch.y = rowY;
    x += ch.width + 32;
    rowH = Math.max(rowH, ch.height);
    i++;
  }
  let maxX = 0, maxY = 0;
  for (const ch of set.children) { maxX = Math.max(maxX, ch.x + ch.width); maxY = Math.max(maxY, ch.y + ch.height); }
  set.resizeWithoutConstraints(maxX + 40, maxY + 40);
  set.strokes = [solid('#9747ff')];
  set.dashPattern = [6, 4];
  set.cornerRadius = 8;
  place(set);
  return set;
};
const from = (x) => `From ${SPEC.site} via site-to-figma.${x ? ' ' + x : ''}`;
const out = { created: [], skipped: [], ids: {} };

// Button: Style x Size (x State when the site has hover rules)
if ((C.button || []).length) {
  if (existing.has('Button')) out.skipped.push('Button'); else {
    const withState = C.button.some((b) => b.hover);
    const comps = [];
    for (const b of C.button) {
      for (const state of withState ? ['default', 'hover'] : ['default']) {
        if (state === 'hover' && !b.hover) continue;
        const s = state === 'hover' ? b.hover : {};
        const c = box(b, s);
        const t = await text(b.text, b.label, s.fg || b.fg);
        c.appendChild(t);
        const key = c.addComponentProperty('Label', 'TEXT', b.label);
        t.componentPropertyReferences = { characters: key };
        if (b.shadow && ES[b.shadow]) await c.setEffectStyleIdAsync(ES[b.shadow].id);
        c.name = `Style=${b.style}, Size=${b.size}${withState ? `, State=${state}` : ''}`;
        comps.push(c);
      }
    }
    const set = combine(comps, 'Button', from(`Samples: ${C.button.map((b) => `"${b.label}" (${b.style})`).join(', ')}.`), withState ? 2 : 4);
    out.created.push('Button');
    out.ids.Button = set.id;
  }
}

// Input: one per size, with a focus state when the site styles :focus
if ((C.input || []).length) {
  if (existing.has('Input')) out.skipped.push('Input'); else {
    const withFocus = C.input.some((x) => x.focus);
    const comps = [];
    for (const x of C.input) {
      for (const state of withFocus ? ['default', 'focus'] : ['default']) {
        if (state === 'focus' && !x.focus) continue;
        const c = box({ ...x, w: x.w }, state === 'focus' ? x.focus : {});
        c.primaryAxisAlignItems = 'MIN';
        c.resize(x.w, Math.max(16, x.h));
        c.primaryAxisSizingMode = 'FIXED';
        c.counterAxisSizingMode = 'FIXED';
        const t = await text(x.text, x.placeholder, x.placeholderColor || x.fg);
        c.appendChild(t);
        const key = c.addComponentProperty('Placeholder', 'TEXT', x.placeholder);
        t.componentPropertyReferences = { characters: key };
        if (x.shadow && ES[x.shadow]) await c.setEffectStyleIdAsync(ES[x.shadow].id);
        c.name = `Size=${x.size}${withFocus ? `, State=${state}` : ''}`;
        comps.push(c);
      }
    }
    const set = combine(comps, 'Input', from(), 2);
    out.created.push('Input');
    out.ids.Input = set.id;
  }
}

// Badge: one per style
if ((C.badge || []).length) {
  if (existing.has('Badge')) out.skipped.push('Badge'); else {
    const comps = [];
    for (const b of C.badge) {
      const c = box({ ...b, w: 40 }, {});
      const t = await text(b.text, b.label, b.fg);
      c.appendChild(t);
      const key = c.addComponentProperty('Label', 'TEXT', b.label);
      t.componentPropertyReferences = { characters: key };
      c.name = `Style=${b.style}`;
      comps.push(c);
    }
    const set = combine(comps, 'Badge', from(), 4);
    out.created.push('Badge');
    out.ids.Badge = set.id;
  }
}

// Card: one per style (elevated / outlined / filled)
if ((C.card || []).length) {
  if (existing.has('Card')) out.skipped.push('Card'); else {
    const comps = [];
    for (const k of C.card) {
      const c = figma.createComponent();
      c.layoutMode = 'VERTICAL';
      c.resize(k.w, 100);
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'FIXED';
      num(c, ['paddingLeft', 'paddingRight'], k.padX || 16);
      num(c, ['paddingTop', 'paddingBottom'], k.padY || k.padX || 16);
      num(c, ['itemSpacing'], k.gap || 8);
      c.fills = paint(k.fill);
      if (k.border) { c.strokes = paint(k.border); c.strokeWeight = k.bw || 1; c.strokeAlign = 'INSIDE'; }
      num(c, RADII, k.radius || 0);
      if (k.shadow && ES[k.shadow]) await c.setEffectStyleIdAsync(ES[k.shadow].id);
      const inner = k.w - 2 * pxOf(k.padX || 16);
      const title = await text(k.titleStyle, k.title || 'Card title', k.titleColor);
      title.textAutoResize = 'HEIGHT';
      title.resize(inner, title.height);
      const body = await text(k.bodyStyle, 'Supporting text for this card goes here.', k.bodyColor);
      body.textAutoResize = 'HEIGHT';
      body.resize(inner, body.height);
      c.appendChild(title);
      c.appendChild(body);
      title.componentPropertyReferences = { characters: c.addComponentProperty('Title', 'TEXT', k.title || 'Card title') };
      body.componentPropertyReferences = { characters: c.addComponentProperty('Body', 'TEXT', 'Supporting text for this card goes here.') };
      c.name = `Style=${k.style}`;
      comps.push(c);
    }
    const set = combine(comps, 'Card', from(), 3);
    out.created.push('Card');
    out.ids.Card = set.id;
  }
}

if (out.created.length) figma.viewport.scrollAndZoomIntoView(page.children.filter((n) => Object.values(out.ids).includes(n.id)));
return { pageId: page.id, ...out, missingStyles: [...styleNames].filter((n) => !TS[n]) };
