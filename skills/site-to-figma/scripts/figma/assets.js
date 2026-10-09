// ---- step: assets (figma-code.zsh puts LOGO and ICONS above; one batch per call) --------------
// The logo and the icons as components on the "Assets" page, inside the board
// "site-to-figma · Assets". An icon whose component already exists is skipped.
const NAME = 'site-to-figma · Assets';
const page = await findPage('Assets');
await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

let board = page.children.find((n) => n.name === NAME && n.type === 'FRAME');
const area = (name) => {
  let a = board.children.find((n) => n.name === name);
  if (a) return a;
  a = figma.createAutoLayout('HORIZONTAL', { name, itemSpacing: 24 });
  a.layoutWrap = 'WRAP';
  a.counterAxisSpacing = 24;
  a.resize(1040, 10);
  a.primaryAxisSizingMode = 'FIXED';
  a.counterAxisSizingMode = 'AUTO';
  a.fills = [];
  board.appendChild(a);
  return a;
};
if (!board) {
  board = figma.createAutoLayout('VERTICAL', { name: NAME, itemSpacing: 32, paddingTop: 64, paddingBottom: 64, paddingLeft: 64, paddingRight: 64 });
  board.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  board.cornerRadius = 24;
  const title = figma.createText();
  title.fontName = { family: 'Inter', style: 'Bold' };
  title.fontSize = 32;
  title.characters = `${SPEC.title} assets`;
  board.appendChild(title);
  const others = page.children.filter((n) => n !== board);
  board.x = others.length ? Math.max(...others.map((n) => n.x + n.width)) + 200 : 0;
}
const have = new Set(page.findAllWithCriteria({ types: ['COMPONENT'] }).map((c) => c.name));
const created = [], skipped = [], failed = [];
const add = (name, svg, where, desc) => {
  if (have.has(name)) { skipped.push(name); return; }
  try {
    const node = figma.createNodeFromSvg(svg);
    const comp = figma.createComponentFromNode(node);
    comp.name = name;
    comp.description = desc;
    area(where).appendChild(comp);
    have.add(name);
    created.push(comp.id);
  } catch (e) {
    failed.push(`${name}: ${String(e.message || e).slice(0, 120)}`);
  }
};
if (LOGO && LOGO.kind === 'svg' && LOGO.svg) add('logo/primary', LOGO.svg, 'Logo', `${LOGO.alt || 'Logo'}. From ${SPEC.site} via site-to-figma.`);
const rasterLogo = LOGO && LOGO.kind === 'img' ? LOGO.src : null;
for (const ic of ICONS) add(`icon/${ic.name}`, ic.svg, 'Icons', `Used ${ic.n} time(s) on ${SPEC.site}. Via site-to-figma.`);
return { pageId: page.id, boardId: board.id, created: created.length, createdIds: created, skipped: skipped.length, failed, rasterLogo };
