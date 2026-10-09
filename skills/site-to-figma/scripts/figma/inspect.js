// ---- step: inspect (read-only) --------------------------------------------------------------------
// What the file already holds: pages, variable collections (and how many variables this tool
// made), text and effect styles. Run first on a file you were given, and before a re-run.
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const vars = await figma.variables.getLocalVariablesAsync();
const byCol = {};
for (const v of vars) {
  const b = byCol[v.variableCollectionId] || (byCol[v.variableCollectionId] = { total: 0, ours: 0 });
  b.total++;
  if (tagOf(v.description) !== null) b.ours++;
}
const texts = await figma.getLocalTextStylesAsync();
const effects = await figma.getLocalEffectStylesAsync();
return {
  file: figma.root.name,
  pages: figma.root.children.map((p) => ({ name: p.name, id: p.id })),
  collections: cols.map((c) => ({ name: c.name, id: c.id, modes: c.modes.map((m) => m.name), variables: (byCol[c.id] || {}).total || 0, bySiteToFigma: (byCol[c.id] || {}).ours || 0 })),
  textStyles: { total: texts.length, bySiteToFigma: texts.filter((s) => tagOf(s.description) !== null).length },
  effectStyles: { total: effects.length, bySiteToFigma: effects.filter((s) => tagOf(s.description) !== null).length },
  previousRun: vars.some((v) => tagOf(v.description) !== null),
};
