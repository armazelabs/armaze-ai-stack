/*
 * synth.js - run inside a browser page (orca eval) by synth.zsh. Pure computation:
 * it touches nothing in the page.
 *
 * Turns the per-page scans (extract-styles.js output, light and dark) into one design
 * system:
 *   - colours: near-duplicates merged (OKLab distance < 1), named into hue families
 *     and 50-950 steps (primitives), then given meanings (text/primary, surface/page,
 *     brand/primary, border/default, status/*) with a light and a dark value (semantic);
 *     colours a component uses that no meaning covers get component tokens
 *     (button/secondary/bg), so components follow the theme in Figma
 *   - type: each distinct text style, named by role and size (heading/lg, body/md,
 *     label/sm, code/sm), with Figma font candidates for every family
 *   - spacing, radius, shadow, motion and breakpoint scales
 *   - core components (button, input, badge, card) with their variants and hover/focus
 *
 * Called as (synth)(pages, opts):
 *   pages: [{ name, light: <scan>, dark: <scan>|null }]
 *   opts:  { site, title, date, overrides, previous }   previous = the last figma-spec.json
 * Returns tokens.json (W3C design-tokens format), figma-spec.json and review.md as one
 * string, separated by lines reading @@STF@@.
 */
((pages, opts) => {
  opts = opts || {};
  const ov = Object.assign({ merge: {}, roles: {}, names: {}, drop: [], fonts: {}, typeNames: {} }, opts.overrides || {});
  const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), typeof v === 'string' ? v.toLowerCase() : v]));
  ov.merge = lower(ov.merge);
  ov.names = lower(ov.names);
  const drop = new Set((ov.drop || []).map((x) => String(x).toLowerCase()));
  const warnings = [];

  // ---- colour maths ---------------------------------------------------------------
  const parse = (h) => ({
    r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255,
    a: h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1,
  });
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const labCache = {};
  const oklab = (hex) => {
    if (labCache[hex]) return labCache[hex];
    const { r, g, b } = parse(hex);
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return (labCache[hex] = {
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    });
  };
  const lch = (hex) => {
    const o = oklab(hex);
    let H = (Math.atan2(o.b, o.a) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L: o.L, C: Math.hypot(o.a, o.b), H, A: parse(hex).a };
  };
  const dE = (x, y) => { const a = oklab(x), b = oklab(y); return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b) * 100; };
  const lum = (hex) => { const { r, g, b } = parse(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const chromatic = (hex) => lch(hex).C >= 0.04;
  const opaque = (hex) => hex && hex.length === 7;

  const FAMILIES = [[20, 'red'], [45, 'red'], [70, 'orange'], [105, 'yellow'], [130, 'lime'], [165, 'green'], [195, 'teal'], [230, 'cyan'], [270, 'blue'], [285, 'indigo'], [305, 'violet'], [325, 'purple'], [345, 'pink'], [361, 'red']];
  const family = (hex) => {
    const c = lch(hex);
    if (c.C < 0.03) return c.L > 0.997 ? 'white' : c.L < 0.02 ? 'black' : 'gray';
    if (c.H < 20) return 'red';
    return FAMILIES.find(([h]) => c.H < h)[1];
  };

  const schemes = ['light', 'dark'];
  const hasDark = pages.some((p) => p.dark);
  const scans = (s) => pages.map((p) => p[s]).filter(Boolean);
  const mapped = (hex) => {
    if (!hex) return null;
    hex = hex.toLowerCase();
    return ov.merge[hex] || hex;
  };

  // ---- 1. colour usage, union of both themes -------------------------------------
  const usage = {}; // hex -> {n, roles:{}, schemes:Set}
  const use = (hex, role, w, scheme) => {
    hex = mapped(hex);
    if (!hex || drop.has(hex)) return;
    const u = usage[hex] || (usage[hex] = { n: 0, roles: {}, schemes: new Set() });
    u.n += w;
    u.roles[role] = (u.roles[role] || 0) + w;
    u.schemes.add(scheme);
  };
  for (const s of schemes) {
    for (const sc of scans(s)) {
      for (const [hex, c] of Object.entries(sc.colors || {})) for (const [role, w] of Object.entries(c.roles)) use(hex, role, w, s);
      for (const groups of Object.values(sc.components || {})) {
        for (const g of groups) {
          for (const k of ['bg', 'fg', 'bc', 'ph']) use(g.st[k], 'comp', 2, s);
          for (const st of Object.values(g.states || {})) for (const k of ['bg', 'fg', 'bc', 'oc']) use(st[k], 'comp', 2, s);
        }
      }
    }
  }

  // ---- 2. cluster near-duplicates ----------------------------------------------------
  const keep = (hex) => usage[hex].n >= 2 || usage[hex].roles.comp || usage[hex].roles['bg:page'];
  const sorted = Object.keys(usage).sort((a, b) => usage[b].n - usage[a].n);
  const rep = {}; // hex -> representative hex
  const reps = [];
  const merged = [];
  for (const hex of sorted) {
    const a = parse(hex).a;
    const near = reps.find((r) => opaque(r) === opaque(hex) && Math.abs(parse(r).a - a) < 0.04 && dE(r.slice(0, 7), hex.slice(0, 7)) < 1);
    if (near && !ov.names[hex]) {
      rep[hex] = near;
      usage[near].n += usage[hex].n;
      for (const [k, v] of Object.entries(usage[hex].roles)) usage[near].roles[k] = (usage[near].roles[k] || 0) + v;
      merged.push([hex, near]);
    } else if (keep(hex)) {
      rep[hex] = hex;
      reps.push(hex);
    }
  }
  const R = (hex) => { hex = mapped(hex); return hex ? rep[hex] || null : null; };
  const nearestRep = (hex) => {
    hex = mapped(hex);
    if (!hex) return null;
    if (rep[hex]) return rep[hex];
    let best = null, bd = 3;
    for (const r of reps) {
      if (opaque(r) !== opaque(hex)) continue;
      const d = dE(r.slice(0, 7), hex.slice(0, 7)) + Math.abs(parse(r).a - parse(hex).a) * 100;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };

  // ---- 3. primitive names --------------------------------------------------------------
  const STEPS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 925, 950, 975];
  const STD = new Set([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
  const GRAY_L = { 50: 0.985, 100: 0.967, 200: 0.928, 300: 0.872, 400: 0.707, 500: 0.551, 600: 0.446, 700: 0.373, 800: 0.278, 900: 0.21, 950: 0.13 };
  const COLOR_L = { 50: 0.971, 100: 0.936, 200: 0.885, 300: 0.808, 400: 0.704, 500: 0.637, 600: 0.577, 700: 0.505, 800: 0.444, 900: 0.396, 950: 0.258 };
  const ladder = (base) => STEPS.map((s) => {
    if (base[s] !== undefined) return base[s];
    if (s === 925) return (base[900] + base[950]) / 2;
    if (s === 975) return base[950] - (base[900] - base[950]) / 2;
    return (base[s - 50] + base[s + 50]) / 2;
  });
  // Assign each colour of a family (sorted light to dark) a strictly increasing step,
  // minimising the lightness error; in-between steps (150, 250...) cost a little extra.
  const assignSteps = (hexes, base) => {
    const L = ladder(base);
    const n = hexes.length, m = STEPS.length;
    if (n > m) return null;
    const cost = (i, j) => Math.abs(lch(hexes[i]).L - L[j]) + (STD.has(STEPS[j]) ? 0 : 0.02);
    const dp = Array.from({ length: n }, () => new Array(m).fill(Infinity));
    const from = Array.from({ length: n }, () => new Array(m).fill(-1));
    for (let j = 0; j < m; j++) dp[0][j] = cost(0, j);
    for (let i = 1; i < n; i++) {
      let bestPrev = Infinity, bestK = -1;
      for (let j = 0; j < m; j++) {
        if (j - 1 >= 0 && dp[i - 1][j - 1] < bestPrev) { bestPrev = dp[i - 1][j - 1]; bestK = j - 1; }
        if (bestK >= 0) { dp[i][j] = bestPrev + cost(i, j); from[i][j] = bestK; }
      }
    }
    let j = dp[n - 1].indexOf(Math.min(...dp[n - 1]));
    const out = new Array(n);
    for (let i = n - 1; i >= 0; i--) { out[i] = STEPS[j]; j = from[i][j]; }
    return out;
  };
  const primName = {}; // rep hex -> name
  const byFamily = {};
  for (const hex of reps) {
    if (ov.names[hex]) { primName[hex] = ov.names[hex]; continue; }
    if (!opaque(hex)) continue;
    const f = family(hex);
    if (f === 'white' || f === 'black') { primName[hex] = primName[hex] || f; continue; }
    (byFamily[f] || (byFamily[f] = [])).push(hex);
  }
  for (const [f, hexes] of Object.entries(byFamily)) {
    hexes.sort((a, b) => lch(b).L - lch(a).L);
    const steps = assignSteps(hexes, f === 'gray' ? GRAY_L : COLOR_L);
    hexes.forEach((h, i) => { primName[h] = steps ? `${f}/${steps[i]}` : `${f}/${i + 1}`; });
  }
  const alphaUsed = {};
  for (const hex of reps) {
    if (primName[hex] || opaque(hex)) continue;
    const c = lch(hex.slice(0, 7));
    const base = c.C < 0.03 ? (c.L < 0.3 ? 'black' : c.L > 0.85 ? 'white' : 'gray') : family(hex.slice(0, 7));
    let name = `alpha/${base}-${Math.round(parse(hex).a * 100)}`;
    alphaUsed[name] = (alphaUsed[name] || 0) + 1;
    if (alphaUsed[name] > 1) name += `-${alphaUsed[name]}`;
    primName[hex] = name;
  }
  // duplicate override names would collide in Figma
  const seenName = {};
  for (const hex of Object.keys(primName)) {
    const n = primName[hex];
    if (seenName[n]) { primName[hex] = `${n}-${hex.slice(1, 7)}`; warnings.push(`Two colours were named ${n}; ${hex} became ${primName[hex]}.`); }
    seenName[primName[hex]] = 1;
  }

  // CSS custom property names for primitives (shortest name wins, tw- and internal names last)
  const cssFor = {};
  for (const s of schemes) {
    for (const sc of scans(s)) {
      for (const [name, v] of Object.entries(sc.vars || {})) {
        if (!v.hex) continue;
        const r = R(v.hex);
        if (!r || s === 'dark') continue;
        const score = (n) => n.length + (/^--(tw|_|un-)/.test(n) ? 100 : 0);
        if (!cssFor[r] || score(name) < score(cssFor[r])) cssFor[r] = name;
      }
    }
  }

  // ---- 4. semantic roles per theme ------------------------------------------------------
  const roleScores = (s) => {
    const out = {};
    for (const sc of scans(s)) {
      for (const [hex, c] of Object.entries(sc.colors || {})) {
        const r = R(hex);
        if (!r) continue;
        const o = out[r] || (out[r] = {});
        for (const [k, w] of Object.entries(c.roles)) o[k] = (o[k] || 0) + w;
      }
    }
    return out;
  };
  const mostCommon = (vals) => {
    const c = {};
    for (const v of vals) if (v) c[v] = (c[v] || 0) + 1;
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null;
  };
  const compGroups = (s, kind) => {
    const g = {};
    for (const sc of scans(s)) for (const x of (sc.components || {})[kind] || []) {
      const key = JSON.stringify(x.st) + x.disabled;
      if (g[key]) g[key].n += x.n; else g[key] = { ...x };
    }
    return Object.values(g).filter((x) => !x.disabled).sort((a, b) => b.n - a.n);
  };

  const rolesFor = (s) => {
    const S = roleScores(s);
    const roles = {};
    const page = R(mostCommon(scans(s).map((sc) => sc.root.bg))) || R('#ffffff');
    roles['surface/page'] = page;
    const sum = (hex, keys) => keys.reduce((t, k) => t + (S[hex][k] || 0), 0);
    const best = (keys, ok = () => true, min = 1) => {
      let b = null, bs = 0;
      for (const hex of Object.keys(S)) {
        if (!ok(hex)) continue;
        const v = sum(hex, keys);
        if (v > bs) { b = hex; bs = v; }
      }
      return bs >= min ? b : null;
    };
    // text: the most-contrasting of the frequent text colours is primary
    const textKeys = ['text:body', 'text:heading', 'text:nav', 'text:footer', 'text:link', 'text:input'];
    const textTotal = Object.keys(S).reduce((t, h) => t + sum(h, textKeys), 0) || 1;
    const frequent = Object.keys(S).filter((h) => opaque(h) && sum(h, textKeys) / textTotal >= 0.08 && contrast(h, page) >= 2.5);
    const primary = frequent.sort((a, b) => contrast(b, page) - contrast(a, page))[0] || best(textKeys, opaque);
    if (primary) roles['text/primary'] = primary;
    const secondary = best(['text:body', 'text:nav', 'text:footer'], (h) => opaque(h) && h !== primary && !chromatic(h) && dE(h, primary) > 5 && contrast(h, page) >= 2, 2);
    if (secondary) roles['text/secondary'] = secondary;
    const muted = best(['text:body', 'text:nav', 'text:footer'], (h) => opaque(h) && h !== primary && h !== secondary && !chromatic(h) && dE(h, primary) > 5 && dE(h, secondary || primary) > 5 && contrast(h, page) >= 2, 3);
    if (muted) roles['text/muted'] = muted;
    const heading = best(['text:heading'], (h) => opaque(h) && contrast(h, page) >= 3, 2);
    if (heading && heading !== primary && heading !== secondary) roles['text/heading'] = heading;
    const link = best(['text:link'], (h) => opaque(h) && h !== primary && h !== secondary && h !== muted && contrast(h, page) >= 3, 2);
    if (link && (chromatic(link) || dE(link, primary) > 8)) roles['text/link'] = link;

    // brand: the strongest filled button, else the most-used chromatic colour
    const buttons = compGroups(s, 'button');
    const filled = buttons.filter((g) => opaque(R(g.st.bg)) && R(g.st.bg) !== page);
    let brandBtn = filled.filter((g) => chromatic(R(g.st.bg))).sort((a, b) => b.n - a.n)[0];
    if (!brandBtn) brandBtn = filled.sort((a, b) => contrast(R(b.st.bg), page) - contrast(R(a.st.bg), page) || b.n - a.n)[0];
    if (brandBtn) {
      roles['brand/primary'] = R(brandBtn.st.bg);
      if (R(brandBtn.st.fg)) roles['brand/on-primary'] = R(brandBtn.st.fg);
      const hv = brandBtn.states && brandBtn.states.hover && R(brandBtn.states.hover.bg);
      if (hv && hv !== roles['brand/primary'] && dE(hv.slice(0, 7), roles['brand/primary'].slice(0, 7)) < 25) roles['brand/primary-hover'] = hv;
    } else {
      const allKeys = [...new Set(Object.values(S).flatMap((o) => Object.keys(o)))];
      const b = best(allKeys, (h) => opaque(h) && chromatic(h), 3);
      if (b) roles['brand/primary'] = b;
    }

    const cards = compGroups(s, 'card');
    const cardBg = cards.map((g) => R(g.st.bg)).find((h) => opaque(h) && h !== page);
    if (cardBg) roles['surface/card'] = cardBg;
    const subtle = best(['bg:section', 'bg:other', 'bg:nav'], (h) => opaque(h) && !chromatic(h) && h !== page && h !== cardBg && h !== roles['brand/primary'] && Math.abs(lch(h).L - lch(page).L) < 0.12, 2);
    if (subtle) roles['surface/subtle'] = subtle;
    const border = best(['border:other', 'border:button', 'border:input'], (h) => h !== page);
    if (border) roles['border/default'] = border;
    const inputBorder = best(['border:input']);
    if (inputBorder && inputBorder !== border) roles['border/input'] = inputBorder;
    const inputs = compGroups(s, 'input');
    const ph = R(mostCommon(inputs.map((g) => g.st.ph)));
    if (ph) roles['text/placeholder'] = ph;
    const focus = R(mostCommon([...buttons, ...inputs].map((g) => g.states && g.states.focus && (g.states.focus.oc || g.states.focus.bc))));
    if (focus && focus !== border) roles['border/focus'] = focus;

    // status colours: the most-used colour of each hue family (inferred)
    const status = { 'status/danger': ['red'], 'status/success': ['green', 'teal'], 'status/warning': ['yellow', 'orange'] };
    for (const [name, fams] of Object.entries(status)) {
      const hit = Object.keys(S).filter((h) => opaque(h) && lch(h).C >= 0.08 && fams.includes(family(h)) && h !== roles['brand/primary'])
        .sort((a, b) => usage[b].n - usage[a].n)[0];
      if (hit) roles[name] = hit;
    }
    return roles;
  };
  const roles = { light: rolesFor('light'), dark: hasDark ? rolesFor('dark') : {} };
  for (const [name, v] of Object.entries(ov.roles || {})) {
    const lv = typeof v === 'string' ? v : v.light;
    const dv = typeof v === 'string' ? v : v.dark;
    if (lv) roles.light[name] = nearestRep(lv) || lv.toLowerCase();
    if (dv) roles.dark[name] = nearestRep(dv) || dv.toLowerCase();
  }
  // A brand colour set by hand takes its on-colour and hover from a button of that colour, if
  // the site has one; the ones derived from the automatically chosen button no longer apply.
  if (ov.roles && ov.roles['brand/primary']) {
    for (const s of schemes) {
      if (!roles[s]['brand/primary']) continue;
      const btn = compGroups(s, 'button').find((g) => (R(g.st.bg) || nearestRep(g.st.bg)) === roles[s]['brand/primary']);
      for (const k of ['brand/on-primary', 'brand/primary-hover']) if (!ov.roles[k]) delete roles[s][k];
      if (btn && !ov.roles['brand/on-primary'] && R(btn.st.fg)) roles[s]['brand/on-primary'] = R(btn.st.fg);
      const hv = btn && btn.states && btn.states.hover && R(btn.states.hover.bg);
      if (hv && !ov.roles['brand/primary-hover'] && dE(hv.slice(0, 7), roles[s]['brand/primary'].slice(0, 7)) < 25) roles[s]['brand/primary-hover'] = hv;
    }
  }
  // a colour an override introduced may not be a primitive yet
  // a colour that is not in the palette yet (from an override) gets the nearest free step
  const ensurePrim = (hex) => {
    if (!hex || primName[hex]) return;
    const used = new Set(Object.values(primName));
    let name = null;
    if (opaque(hex)) {
      const f = family(hex);
      if (f === 'white' || f === 'black') name = used.has(f) ? null : f;
      else {
        const L = ladder(f === 'gray' ? GRAY_L : COLOR_L);
        const l = lch(hex).L;
        const order = STEPS.map((st, i) => [st, Math.abs(L[i] - l)]).sort((a, b) => a[1] - b[1]);
        const free = order.find(([st]) => !used.has(`${f}/${st}`));
        if (free) name = `${f}/${free[0]}`;
      }
      if (!name) name = `${f}/${hex.slice(1)}`;
    } else name = `alpha/${hex.slice(1)}`;
    primName[hex] = name;
    reps.push(hex);
    rep[hex] = hex;
    usage[hex] = usage[hex] || { n: 0, roles: {}, schemes: new Set() };
  };
  for (const s of schemes) for (const h of Object.values(roles[s])) ensurePrim(h);

  const ROLE_ORDER = ['surface/page', 'surface/subtle', 'surface/card', 'text/primary', 'text/secondary', 'text/muted', 'text/heading', 'text/link', 'text/placeholder', 'brand/primary', 'brand/primary-hover', 'brand/on-primary', 'border/default', 'border/input', 'border/focus', 'status/danger', 'status/success', 'status/warning'];
  const semantic = [];
  const semIndex = {};
  const addSem = (name, light, dark, extra) => {
    if (semIndex[name]) return semIndex[name];
    const t = { name, light, dark: hasDark ? dark || light : null, ...extra };
    semantic.push(t);
    semIndex[name] = t;
    return t;
  };
  const roleNames = [...new Set([...ROLE_ORDER, ...Object.keys(roles.light), ...Object.keys(roles.dark)])];
  // A surface, text or border meaning seen in only one theme has no honest value in the
  // other, so it is left out; brand and status colours usually stay the same across themes.
  for (const name of roleNames) {
    const l = roles.light[name], d = roles.dark[name];
    if (!l && !d) continue;
    if (hasDark && (!l || !d) && !/^(brand|status)\//.test(name)) {
      warnings.push(`${name} was only found in the ${l ? 'light' : 'dark'} theme, so it was left out.`);
      continue;
    }
    addSem(name, l || d, d || l, { inferred: name.startsWith('status/') });
  }

  // ---- 5. typography ---------------------------------------------------------------------
  const clean = (fam) => (fam || '').replace(/^["']|["']$/g, '').trim().replace(/^__(.+?)_[0-9a-f]{5,8}$/i, '$1').replace(/\s+Fallback$/i, '').trim();
  const FALLBACK = {
    inter: 'Inter', 'sf pro': 'Inter', 'sf pro text': 'Inter', 'sf pro display': 'Inter', '-apple-system': 'Inter', blinkmacsystemfont: 'Inter', 'system-ui': 'Inter',
    'ui-sans-serif': 'Inter', 'segoe ui': 'Inter', 'helvetica neue': 'Inter', helvetica: 'Inter', arial: 'Inter', 'sans-serif': 'Inter', söhne: 'Inter', sohne: 'Inter',
    graphik: 'Inter', 'suisse intl': 'Inter', 'neue haas grotesk': 'Inter', 'neue haas grotesk display': 'Inter', 'aktiv grotesk': 'Inter', 'abc diatype': 'Inter',
    circular: 'DM Sans', 'circular std': 'DM Sans', 'gt walsheim': 'DM Sans', 'gt america': 'DM Sans', 'proxima nova': 'Montserrat', gotham: 'Montserrat',
    avenir: 'Nunito Sans', 'avenir next': 'Nunito Sans', futura: 'Jost', gilroy: 'Plus Jakarta Sans', 'cerebri sans': 'Plus Jakarta Sans', 'sofia pro': 'Outfit',
    tiempos: 'Source Serif 4', 'tiempos text': 'Source Serif 4', 'tiempos headline': 'Source Serif 4', georgia: 'Source Serif 4', 'times new roman': 'Source Serif 4',
    times: 'Source Serif 4', 'ui-serif': 'Source Serif 4', serif: 'Source Serif 4', menlo: 'JetBrains Mono', monaco: 'JetBrains Mono', 'sf mono': 'JetBrains Mono',
    consolas: 'JetBrains Mono', 'ui-monospace': 'JetBrains Mono', monospace: 'JetBrains Mono', 'courier new': 'JetBrains Mono', sfmono: 'JetBrains Mono',
  };
  const isMono = (fam, stack) => /mono|code|consol|menlo|courier/i.test(fam + ' ' + (stack || ''));
  const isSerif = (fam, stack) => !isMono(fam, stack) && /(^|[^-])serif/i.test((stack || '').replace(/sans-serif/gi, '')) || /serif|georgia|times|tiempos/i.test(fam.replace(/sans/i, ''));
  const candidates = (fam, stack) => {
    const c = clean(fam);
    const spaced = c.replace(/([a-z])([A-Z])/g, '$1 $2');
    const short = spaced.replace(/\s+(Sans|Text|Display|Variable|VF|Web|Pro)$/i, '');
    const stackFams = (stack || '').split(',').map((x) => clean(x.trim())).filter(Boolean);
    const fb = ov.fonts[fam] || ov.fonts[c] || FALLBACK[c.toLowerCase()] ||
      stackFams.map((x) => FALLBACK[x.toLowerCase()]).find(Boolean) ||
      (isMono(fam, stack) ? 'JetBrains Mono' : isSerif(fam, stack) ? 'Source Serif 4' : 'Inter');
    const list = ov.fonts[fam] || ov.fonts[c] ? [ov.fonts[fam] || ov.fonts[c]] : [];
    for (const x of [c, spaced, short, ...stackFams.slice(1, 3), fb, 'Inter']) if (x && !list.includes(x) && !/^(-apple-system|BlinkMacSystemFont|system-ui|ui-sans-serif|sans-serif|serif|monospace|ui-monospace)$/i.test(x)) list.push(x);
    return list;
  };

  const typeAgg = {};
  const lightScans = scans('light').length ? scans('light') : scans('dark');
  for (const sc of lightScans) {
    for (const t of sc.type || []) {
      const lh = t.lh === 'normal' ? null : Math.round(t.lh * 2) / 2;
      const key = [t.family, t.size, t.weight, lh, t.ls, t.tt, t.italic].join('|');
      const a = typeAgg[key] || (typeAgg[key] = { family: t.family, stack: t.stack, size: t.size, weight: +t.weight || 400, lh, ls: t.ls, tt: t.tt || null, italic: !!t.italic, n: 0, chars: 0, tags: {}, roles: {}, sample: '' });
      a.n += t.n;
      a.chars += t.chars;
      for (const [k, v] of Object.entries(t.tags)) a.tags[k] = (a.tags[k] || 0) + v;
      for (const [k, v] of Object.entries(t.roles)) a.roles[k] = (a.roles[k] || 0) + v;
      if (!a.sample && t.sample) a.sample = t.sample;
    }
  }
  const allType = [];
  for (const t of Object.values(typeAgg).sort((a, b) => b.n - a.n)) {
    const twin = allType.find((x) => x.family === t.family && x.size === t.size && x.weight === t.weight && Math.abs(x.ls - t.ls) <= 0.2 && x.tt === t.tt && x.italic === t.italic &&
      (x.lh === t.lh || (x.lh && t.lh && Math.abs(x.lh - t.lh) <= 1.5)));
    if (!twin) { allType.push(t); continue; }
    twin.n += t.n;
    twin.chars += t.chars;
    for (const [k, v] of Object.entries(t.tags)) twin.tags[k] = (twin.tags[k] || 0) + v;
    for (const [k, v] of Object.entries(t.roles)) twin.roles[k] = (twin.roles[k] || 0) + v;
  }
  const totalN = allType.reduce((t, x) => t + x.n, 0) || 1;
  const headingN = (t) => Object.entries(t.tags).filter(([k]) => /^h[1-6]$/.test(k)).reduce((s, [, v]) => s + v, 0);
  const keptType = allType.filter((t) => t.n >= 2 || headingN(t) > 0 || t.roles.button).slice(0, 22).filter((t) => t.n / totalN >= 0.004 || headingN(t) > 0 || t.roles.button);
  // the body size: the 12-20px size carrying the most running text (all weights together)
  const bySize = {};
  for (const t of allType) if (!headingN(t) && !t.roles.button && !isMono(t.family, t.stack) && t.size >= 12 && t.size <= 20) bySize[t.size] = (bySize[t.size] || 0) + t.chars;
  const bodyBase = +(Object.entries(bySize).sort((a, b) => b[1] - a[1])[0] || [16])[0];
  const w100 = (w) => Math.min(900, Math.max(100, Math.round(w / 100) * 100));
  const weightSuffix = (w) => (w100(w) >= 600 ? '-strong' : w100(w) === 500 ? '-medium' : '');
  const relSize = (size) => {
    const d = size - bodyBase;
    return d > 4 ? '2xl' : d > 2 ? 'xl' : d >= 0.5 ? 'lg' : d > -0.5 ? 'md' : d >= -2.5 ? 'sm' : 'xs';
  };
  const textStyles = [];
  const usedNames = {};
  for (const t of keptType) {
    const mono = isMono(t.family, t.stack);
    const isHeading = headingN(t) / t.n >= 0.5 || (t.size >= bodyBase * 1.5 && t.weight >= 500 && !t.roles.button);
    const isLabel = !isHeading && (t.roles.button || 0) / t.n >= 0.5;
    let name;
    if (mono) name = `code/${relSize(t.size)}`;
    else if (isHeading) name = t.size >= 64 ? 'display/xl' : t.size >= 56 ? 'display/lg' : t.size >= 48 ? 'display/md' : t.size >= 36 ? 'heading/2xl' : t.size >= 30 ? 'heading/xl' : t.size >= 24 ? 'heading/lg' : t.size >= 20 ? 'heading/md' : t.size >= 16 ? 'heading/sm' : 'heading/xs';
    else if (isLabel) name = `label/${relSize(t.size)}`;
    else name = `body/${relSize(t.size)}${weightSuffix(t.weight)}`;
    if (t.italic) name += '-italic';
    if (t.tt === 'uppercase') name += '-caps';
    const baseName = name;
    const word = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' }[w100(t.weight)];
    const hasWeight = /-(strong|medium)\b/.test(baseName);
    const lhTag = t.lh ? `-lh${Math.round(t.lh)}` : '';
    const alts = [baseName, ...(hasWeight ? [] : [`${baseName}-${word}`]), `${baseName}-${t.size}`, `${baseName}-${t.size}${lhTag}`];
    for (const alt of alts) { name = alt; if (!usedNames[name]) break; }
    for (let i = 2; usedNames[name]; i++) name = `${baseName}-${t.size}-${t.weight}-${i}`;
    usedNames[name] = 1;
    if (ov.typeNames[name]) name = ov.typeNames[name];
    textStyles.push({ name, family: t.family, stack: t.stack, weight: t.weight, size: t.size, lh: t.lh, ls: t.ls, tt: t.tt, italic: t.italic, n: t.n, sample: t.sample, role: mono ? 'mono' : isHeading ? 'heading' : isLabel ? 'label' : 'body' });
  }
  textStyles.sort((a, b) => b.size - a.size || b.weight - a.weight);

  const faces = lightScans.flatMap((sc) => (sc.fonts && sc.fonts.faces) || []);
  const fonts = [];
  for (const t of textStyles) {
    let f = fonts.find((x) => x.family === t.family);
    if (!f) {
      const face = faces.find((x) => clean(x.family).toLowerCase() === clean(t.family).toLowerCase());
      const source = !face ? (FALLBACK[clean(t.family).toLowerCase()] ? 'system' : 'unknown') : /fonts\.gstatic\.com|fonts\.googleapis/.test(face.src) ? 'google' : face.src === 'data:' ? 'embedded' : 'self-hosted';
      f = { family: t.family, candidates: candidates(t.family, t.stack), roles: [], weights: [], source };
      fonts.push(f);
    }
    if (!f.roles.includes(t.role)) f.roles.push(t.role);
    if (!f.weights.includes(t.weight)) f.weights.push(t.weight);
  }
  fonts.forEach((f) => f.weights.sort((a, b) => a - b));

  // ---- 6. spacing, radius, shadows, motion -----------------------------------------------
  const spaceAgg = {};
  for (const sc of lightScans) for (const [v, e] of Object.entries(sc.space || {})) if (+v >= 2) spaceAgg[v] = (spaceAgg[v] || 0) + e.n;
  const spaceTotal = Object.values(spaceAgg).reduce((t, n) => t + n, 0) || 1;
  const share = (d) => Object.entries(spaceAgg).filter(([v]) => +v % d === 0).reduce((t, [, n]) => t + n, 0) / spaceTotal;
  const base = share(8) >= 0.7 ? 8 : share(4) >= 0.6 ? 4 : 2;
  const minN = Math.max(3, spaceTotal * 0.002);
  const fmt = (x) => (Math.round(x * 100) / 100).toString();
  const space = [];
  const offGrid = [];
  for (const [v, n] of Object.entries(spaceAgg).sort((a, b) => +a[0] - +b[0])) {
    const px = +v;
    const okSize = px >= 2 && (px <= 160 || (px <= 256 && px % 16 === 0));
    if (okSize && n >= minN && px % 2 === 0) space.push({ name: `space/${fmt(px / 4).replace('.', '_')}`, px, n });
    else if (n >= 3 && px <= 256) offGrid.push([px, n]);
  }

  const radAgg = {};
  for (const sc of lightScans) for (const [v, n] of Object.entries(sc.radius || {})) {
    const k = v === 'full' ? 'full' : String(Math.round(+v));
    radAgg[k] = (radAgg[k] || 0) + n;
  }
  for (const s of schemes) for (const kind of ['button', 'input', 'badge', 'card']) for (const g of compGroups(s, kind)) {
    const k = g.st.r === 'full' ? 'full' : String(Math.round(+g.st.r || 0));
    if (k !== '0') radAgg[k] = Math.max(radAgg[k] || 0, 2);
  }
  const radius = [];
  const radNames = {};
  const bucket = (px) => (px <= 2 ? 'xs' : px <= 4 ? 'sm' : px <= 6 ? 'md' : px <= 8 ? 'lg' : px <= 12 ? 'xl' : px <= 16 ? '2xl' : px <= 24 ? '3xl' : '4xl');
  for (const [k, n] of Object.entries(radAgg).filter(([k, n]) => k !== 'full' && +k > 0 && n >= 2).sort((a, b) => +a[0] - +b[0]).slice(0, 10)) {
    let name = `radius/${bucket(+k)}`;
    if (radNames[name]) name = `${name}-${k}`;
    radNames[name] = 1;
    radius.push({ name, px: +k, n });
  }
  if (radAgg.full) radius.push({ name: 'radius/full', px: 9999, n: radAgg.full });

  const parseShadow = (s) => s.split('; ').map((l) => {
    const [x, y, blur, spread, hex, inset] = l.split(' ');
    return { x: +x, y: +y, blur: +blur, spread: +spread, hex, inset: inset === 'inset' };
  });
  const shAgg = {};
  for (const sc of lightScans) for (const [k, n] of Object.entries(sc.shadow || {})) shAgg[k] = (shAgg[k] || 0) + n;
  for (const kind of ['button', 'input', 'badge', 'card']) for (const g of compGroups(scans('light').length ? 'light' : 'dark', kind)) if (g.st.sh) shAgg[g.st.sh] = Math.max(shAgg[g.st.sh] || 0, 2);
  const shTop = Object.entries(shAgg).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => ({ key: k, n, layers: parseShadow(k) }))
    .sort((a, b) => Math.max(...a.layers.map((l) => l.blur + Math.abs(l.y))) - Math.max(...b.layers.map((l) => l.blur + Math.abs(l.y))));
  const shNames = shTop.length <= 3 ? ['sm', 'md', 'lg'] : ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const shadows = shTop.map((s, i) => ({ name: `shadow/${shNames[i]}`, layers: s.layers, n: s.n, key: s.key }));
  const shadowName = (key) => (shadows.find((s) => s.key === key) || {}).name || null;

  const durAgg = {}, easeAgg = {}, bpAgg = {}, contAgg = {};
  for (const sc of lightScans) {
    for (const [k, n] of Object.entries((sc.motion || {}).durations || {})) durAgg[k] = (durAgg[k] || 0) + n;
    for (const [k, n] of Object.entries((sc.motion || {}).easings || {})) easeAgg[k] = (easeAgg[k] || 0) + n;
    for (const [k, n] of Object.entries(sc.breakpoints || {})) bpAgg[k] = (bpAgg[k] || 0) + n;
    for (const [k, n] of Object.entries(sc.containers || {})) contAgg[k] = (contAgg[k] || 0) + n;
  }
  const ms = (d) => (d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000);
  const durations = Object.entries(durAgg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => ms(d)).filter((x) => x > 0).sort((a, b) => a - b);
  const durNames = durations.length === 1 ? ['base'] : durations.length === 2 ? ['fast', 'base'] : ['fast', 'base', 'slow'];
  const easings = Object.entries(easeAgg).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => e).filter(Boolean);
  const breakpoints = Object.entries(bpAgg).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => +k).sort((a, b) => a - b);
  const containers = Object.entries(contAgg).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => +k);

  // ---- 7. components -----------------------------------------------------------------------
  const textStyleFor = (st) => {
    const same = textStyles.filter((t) => t.family === st.ff && Math.abs(t.size - st.fs) < 0.5 && Math.abs(t.weight - (+st.fw || 400)) < 50);
    const pick = same.find((t) => t.lh === st.lh) || same[0];
    if (pick) return pick.name;
    const near = textStyles.filter((t) => t.family === st.ff).sort((a, b) => Math.abs(a.size - st.fs) - Math.abs(b.size - st.fs) || Math.abs(a.weight - st.fw) - Math.abs(b.weight - st.fw))[0];
    return near ? near.name : null;
  };
  const spaceRef = (px) => { const t = space.find((x) => x.px === Math.round(px)); return t ? t.name : Math.round(px * 100) / 100; };
  const radiusRef = (r) => (r === 'full' ? (radius.find((x) => x.name === 'radius/full') || { name: 9999 }).name : (radius.find((x) => x.px === Math.round(+r)) || { name: Math.round(+r) || 0 }).name);
  // A colour slot gets a semantic token from the groups that suit it (allowed, in order of
  // preference) whose light and dark values both match, else a token of the same component,
  // else a new component token (when there is a dark theme), else its primitive.
  const suits = (t, p) => t.name.startsWith(p) &&
    (p.includes('/on') || !t.name.includes('/on-')) && (p.includes('focus') || !t.name.endsWith('/focus')) && (p.includes('hover') || !t.name.endsWith('-hover'));
  const colorRef = (light, dark, compName, allowed) => {
    const l = nearestRep(light);
    const d = hasDark ? nearestRep(dark) || l : null;
    if (!l) return null;
    ensurePrim(l);
    if (d) ensurePrim(d);
    const fits = semantic.filter((t) => t.light === l && (!hasDark || t.dark === d));
    for (const p of allowed) {
      const hit = fits.find((t) => !t.component && suits(t, p));
      if (hit) return hit.name;
    }
    const variant = compName.slice(0, compName.lastIndexOf('/') + 1);
    const own = fits.find((t) => t.component && t.name.startsWith(variant));
    if (own) return own.name;
    if (hasDark && d !== l) {
      let name = compName;
      for (let i = 2; semIndex[name]; i++) name = `${compName}-${i}`;
      return addSem(name, l, d, { component: true }).name;
    }
    return primName[l];
  };
  const darkTwin = (kind, g) => {
    if (!hasDark) return null;
    return compGroups('dark', kind).find((x) => x.text === g.text && x.st.h === g.st.h) || null;
  };
  const sizeOf = (h) => (h <= 30 ? 'sm' : h <= 42 ? 'md' : 'lg');
  const components = { button: [], input: [], badge: [], card: [] };
  const lightOrDark = scans('light').length ? 'light' : 'dark';
  const page0 = roles.light['surface/page'] || roles.dark['surface/page'];

  const styleCount = {};
  for (const g of compGroups(lightOrDark, 'button')) {
    const st = g.st;
    const bg = R(st.bg) || nearestRep(st.bg);
    const filled = opaque(st.bg) && bg !== page0;
    let style = bg && bg === roles.light['brand/primary'] ? 'primary' : filled ? 'secondary' : st.bc ? 'outline' : st.td ? 'link' : 'ghost';
    if (style === 'secondary') {
      const same = components.button.find((b) => b.style.startsWith('secondary') && b.bgHex === bg);
      if (same) style = same.style;
      else if (components.button.some((b) => b.style.startsWith('secondary'))) style = `secondary-${(styleCount.secondary = (styleCount.secondary || 1) + 1)}`;
    }
    const size = sizeOf(st.h);
    if (components.button.some((b) => b.style === style && b.size === size)) continue;
    if (components.button.length >= 8) break;
    const d = darkTwin('button', g);
    const ds = d ? d.st : {};
    const v = `button/${style}`;
    // A hover background far from the button's own colour (pink to grey) comes from a generic
    // rule that happens to match, not from this button's design; drop it.
    const hov0 = g.states && g.states.hover;
    const hov = hov0 && hov0.bg && st.bg && opaque(st.bg) && dE(hov0.bg.slice(0, 7), st.bg.slice(0, 7)) >= 25
      ? (({ bg, ...rest }) => (Object.keys(rest).length ? rest : null))(hov0)
      : hov0;
    const dhov = d && d.states && d.states.hover;
    components.button.push({
      style, size, label: g.text, n: g.n, h: st.h, w: st.w, bgHex: bg,
      padX: spaceRef(st.pl), padY: spaceRef(st.pt), radius: radiusRef(st.r), bw: st.bc ? st.bw : 0, gap: spaceRef(st.gap || 0),
      text: textStyleFor(st), shadow: shadowName(st.sh),
      fill: st.bg ? colorRef(st.bg, ds.bg, `${v}/bg`, ['brand/primary', 'brand/', 'surface/', 'status/']) : null,
      fg: colorRef(st.fg, ds.fg, `${v}/fg`, ['brand/on', 'text/', 'status/']),
      border: st.bc ? colorRef(st.bc, ds.bc, `${v}/border`, ['border/default', 'border/input', 'border/', 'brand/primary']) : null,
      hover: hov && (hov.bg || hov.fg || hov.bc) ? {
        fill: hov.bg ? colorRef(hov.bg, dhov && dhov.bg, `${v}/bg-hover`, ['brand/primary-hover', 'surface/', 'brand/']) : null,
        fg: hov.fg ? colorRef(hov.fg, dhov && dhov.fg, `${v}/fg-hover`, ['text/', 'brand/on']) : null,
        border: hov.bc ? colorRef(hov.bc, dhov && dhov.bc, `${v}/border-hover`, ['border/']) : null,
      } : null,
    });
  }
  components.button.forEach((b) => delete b.bgHex);

  for (const g of compGroups(lightOrDark, 'input').slice(0, 2)) {
    const st = g.st;
    const d = darkTwin('input', g);
    const ds = d ? d.st : {};
    const foc = g.states && g.states.focus;
    const dfoc = d && d.states && d.states.focus;
    const size = components.input.length ? sizeOf(st.h) : 'default';
    if (components.input.some((x) => x.size === size)) continue;
    components.input.push({
      size, placeholder: g.text, n: g.n, h: st.h, w: Math.max(200, Math.min(400, st.w)),
      padX: spaceRef(st.pl), radius: radiusRef(st.r), bw: st.bc ? st.bw : 0, text: textStyleFor(st), shadow: shadowName(st.sh),
      fill: st.bg ? colorRef(st.bg, ds.bg, 'input/bg', ['surface/']) : null,
      fg: colorRef(st.fg, ds.fg, 'input/fg', ['text/primary', 'text/']),
      placeholderColor: st.ph ? colorRef(st.ph, ds.ph, 'input/placeholder', ['text/placeholder', 'text/muted', 'text/']) : null,
      border: st.bc ? colorRef(st.bc, ds.bc, 'input/border', ['border/input', 'border/default', 'border/']) : null,
      focus: foc && (foc.bc || foc.oc) ? { border: colorRef(foc.bc || foc.oc, dfoc && (dfoc.bc || dfoc.oc), 'input/border-focus', ['border/focus', 'brand/primary', 'border/']) } : null,
    });
  }

  for (const g of compGroups(lightOrDark, 'badge')) {
    if (components.badge.length >= 4) break;
    const st = g.st;
    const bg = R(st.bg) || nearestRep(st.bg);
    let style = !st.bg ? 'outline' : bg === roles.light['brand/primary'] ? 'brand' : chromatic(bg || '#000000') ? family(bg) : 'neutral';
    if (components.badge.some((b) => b.style === style)) continue;
    const d = darkTwin('badge', g);
    const ds = d ? d.st : {};
    const v = `badge/${style}`;
    components.badge.push({
      style, label: g.text, n: g.n, h: st.h, padX: spaceRef(st.pl), padY: spaceRef(st.pt), radius: radiusRef(st.r), bw: st.bc ? st.bw : 0, text: textStyleFor(st),
      fill: st.bg ? colorRef(st.bg, ds.bg, `${v}/bg`, ['surface/', 'brand/', 'status/']) : null,
      fg: colorRef(st.fg, ds.fg, `${v}/fg`, ['text/', 'brand/on', 'status/']),
      border: st.bc ? colorRef(st.bc, ds.bc, `${v}/border`, ['border/default', 'border/input', 'border/', 'brand/primary']) : null,
    });
  }

  for (const g of compGroups(lightOrDark, 'card')) {
    if (components.card.length >= 2) break;
    const st = g.st;
    const style = st.sh ? 'elevated' : st.bc ? 'outlined' : 'filled';
    if (components.card.some((c) => c.style === style)) continue;
    const d = darkTwin('card', g);
    const ds = d ? d.st : {};
    // a card title: the 14-24px, weight 500+ style closest to 18px; else the nearest heading
    const titleStyle = (textStyles.filter((t) => t.role !== 'mono' && t.size >= 14 && t.size <= 24 && t.weight >= 500).sort((a, b) => Math.abs(a.size - 18) - Math.abs(b.size - 18))[0] ||
      textStyles.filter((t) => t.role === 'heading').sort((a, b) => a.size - b.size)[0] || {}).name || null;
    const bodyStyle = (textStyles.find((t) => t.name === 'body/md') || textStyles.find((t) => t.role === 'body') || {}).name || null;
    components.card.push({
      style, title: g.text, n: g.n, w: Math.max(240, Math.min(480, st.w)), h: st.h,
      padX: spaceRef(st.pl), padY: spaceRef(st.pt), radius: radiusRef(st.r), bw: st.bc ? st.bw : 0, shadow: shadowName(st.sh), gap: spaceRef(st.gap || 8),
      titleStyle, bodyStyle,
      fill: st.bg ? colorRef(st.bg, ds.bg, `card/${style}/bg`, ['surface/card', 'surface/']) : null,
      border: st.bc ? colorRef(st.bc, ds.bc, `card/${style}/border`, ['border/default', 'border/']) : null,
      titleColor: semIndex['text/heading'] ? 'text/heading' : semIndex['text/primary'] ? 'text/primary' : null,
      bodyColor: semIndex['text/secondary'] ? 'text/secondary' : semIndex['text/primary'] ? 'text/primary' : null,
    });
  }

  // ---- 8. outputs ------------------------------------------------------------------------------
  const prims = reps.filter((h) => primName[h]).map((h) => ({ name: primName[h], hex: h, css: cssFor[h] || null, n: usage[h] ? Math.round(usage[h].n) : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const semOut = semantic.map((t) => ({ name: t.name, light: primName[t.light], dark: t.dark ? primName[t.dark] : null, lightHex: t.light, darkHex: t.dark, ...(t.inferred ? { inferred: true } : {}), ...(t.component ? { component: true } : {}) }));
  const modes = hasDark ? ['Light', 'Dark'] : ['Default'];
  const title = opts.title || (lightScans[0] && lightScans[0].title) || opts.site || 'Site';
  const spec = {
    v: 1, generator: 'site-to-figma', site: opts.site || (lightScans[0] && lightScans[0].url) || '', title, date: opts.date || '', modes,
    pages: pages.map((p) => ({ name: p.name, url: (p.light || p.dark || {}).url || '' })),
    primitives: prims.map(({ name, hex, css }) => ({ name, hex, css })),
    semantic: semOut.map(({ name, light, dark, inferred, component }) => ({ name, light, dark, ...(inferred ? { inferred } : {}), ...(component ? { component } : {}) })),
    space: space.map(({ name, px }) => ({ name, px })),
    radius: radius.map(({ name, px }) => ({ name, px })),
    fonts: fonts.map(({ family, candidates: c, roles: r, weights, source }) => ({ family, candidates: c, roles: r, weights, source })),
    text: textStyles.map(({ name, family, weight, size, lh, ls, tt, italic, sample }) => ({ name, family, weight, size, lh, ls, tt, italic, sample })),
    shadows: shadows.map(({ name, layers }) => ({ name, layers })),
    components,
  };

  // W3C design tokens
  const setPath = (obj, path, val) => {
    const parts = path.split('/');
    let o = obj;
    for (const p of parts.slice(0, -1)) o = o[p] || (o[p] = {});
    o[parts[parts.length - 1]] = val;
  };
  const ref = (name) => `{color.${name.replace(/\//g, '.')}}`;
  const tokens = {};
  for (const p of prims) setPath(tokens, `color/${p.name}`, { $type: 'color', $value: p.hex, ...(p.css ? { $extensions: { 'site-to-figma': { css: p.css } } } : {}) });
  for (const t of semOut) {
    const ext = {};
    if (t.dark) ext.dark = ref(t.dark);
    if (t.inferred) ext.inferred = true;
    setPath(tokens, `semantic/${t.name}`, { $type: 'color', $value: ref(t.light), ...(Object.keys(ext).length ? { $extensions: { 'site-to-figma': ext } } : {}) });
  }
  for (const s of space) setPath(tokens, s.name, { $type: 'dimension', $value: `${s.px}px` });
  for (const r of radius) setPath(tokens, r.name, { $type: 'dimension', $value: `${r.px}px` });
  const famKey = (f) => clean(f).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const f of fonts) setPath(tokens, `font/family/${famKey(f.family)}`, { $type: 'fontFamily', $value: [f.family, ...f.candidates.filter((c) => c !== f.family).slice(0, 2)] });
  for (const t of textStyles) {
    setPath(tokens, `typography/${t.name}`, {
      $type: 'typography',
      $value: { fontFamily: `{font.family.${famKey(t.family)}}`, fontWeight: t.weight, fontSize: `${t.size}px`, lineHeight: t.lh ? Math.round((t.lh / t.size) * 1000) / 1000 : 'normal', letterSpacing: `${t.ls}px` },
      ...(t.tt || t.italic ? { $extensions: { 'site-to-figma': { ...(t.tt ? { textTransform: t.tt } : {}), ...(t.italic ? { fontStyle: 'italic' } : {}) } } } : {}),
    });
  }
  for (const s of shadows) setPath(tokens, s.name, { $type: 'shadow', $value: s.layers.map((l) => ({ color: l.hex, offsetX: `${l.x}px`, offsetY: `${l.y}px`, blur: `${l.blur}px`, spread: `${l.spread}px`, ...(l.inset ? { inset: true } : {}) })) });
  durations.forEach((d, i) => setPath(tokens, `duration/${durNames[i]}`, { $type: 'duration', $value: `${d}ms` }));
  easings.forEach((e, i) => {
    const m = e.match(/cubic-bezier\(([^)]+)\)/);
    const named = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1], linear: [0, 0, 1, 1] };
    const v = m ? m[1].split(',').map(Number) : named[e];
    if (v) setPath(tokens, `easing/${i === 0 ? 'default' : 'alt'}`, { $type: 'cubicBezier', $value: v });
  });
  tokens.$extensions = { 'site-to-figma': { site: spec.site, title, date: spec.date, modes, pages: spec.pages, breakpoints, containers, components } };

  // review.md
  const L = [];
  const pageNames = spec.pages.map((p) => p.name).join(', ');
  L.push(`# ${title}: extracted design system`, '');
  L.push(`Source: ${spec.site}  `, `Pages scanned: ${pageNames}  `, `Themes: ${hasDark ? 'light and dark' : 'one theme'}  `, `Date: ${spec.date}`, '');
  L.push(`## Colour meanings (${semOut.filter((t) => !t.component).length})`, '');
  L.push(hasDark ? '| Token | Light | Dark |' : '| Token | Value |', hasDark ? '|---|---|---|' : '|---|---|');
  for (const t of semOut.filter((x) => !x.component)) {
    const cell = (n, h) => `${n} \`${h}\``;
    L.push(hasDark ? `| ${t.name}${t.inferred ? ' *(guessed)*' : ''} | ${cell(t.light, t.lightHex)} | ${cell(t.dark, t.darkHex)} |` : `| ${t.name}${t.inferred ? ' *(guessed)*' : ''} | ${cell(t.light, t.lightHex)} |`);
  }
  const compSem = semOut.filter((t) => t.component);
  if (compSem.length) L.push('', `Component colour tokens: ${compSem.map((t) => t.name).join(', ')}`);
  L.push('', `## Palette (${prims.length} colours)`, '');
  const fams = {};
  for (const p of prims) { const f = p.name.split('/')[0]; (fams[f] || (fams[f] = [])).push(p); }
  L.push('| Family | Steps |', '|---|---|');
  for (const [f, list] of Object.entries(fams)) L.push(`| ${f} | ${list.map((p) => `${p.name.split('/').slice(1).join('/') || f} \`${p.hex}\``).join(' · ')} |`);
  if (merged.length) L.push('', `Merged ${merged.length} near-identical colours into their most-used neighbour${merged.length ? ` (for example ${merged.slice(0, 5).map(([a, b]) => `\`${a}\` into \`${b}\``).join(', ')})` : ''}.`);
  const dropped = Object.keys(usage).filter((h) => !rep[h]).length;
  if (dropped) L.push(`Left out ${dropped} colours used only once.`);
  L.push('', `## Fonts`, '', '| Font on the site | Used for | Weights | Source | Figma will try |', '|---|---|---|---|---|');
  for (const f of fonts) L.push(`| ${f.family} | ${f.roles.join(', ')} | ${f.weights.join(', ')} | ${f.source} | ${f.candidates.join(' → ')} |`);
  L.push('', `## Text styles (${textStyles.length})`, '', '| Style | Font | Size / line | Weight | Sample |', '|---|---|---|---|---|');
  for (const t of textStyles) L.push(`| ${t.name} | ${t.family} | ${t.size}px / ${t.lh ? t.lh + 'px' : 'normal'}${t.ls ? `, ${t.ls}px tracking` : ''}${t.tt ? `, ${t.tt}` : ''} | ${t.weight} | ${(t.sample || '').replace(/\|/g, '/')} |`);
  L.push('', `## Spacing (base ${base}px)`, '', space.map((s) => `${s.name} = ${s.px}px`).join(' · ') || 'none found');
  if (offGrid.length) L.push('', `Off-scale values seen and left out: ${offGrid.slice(0, 12).map(([v, n]) => `${v}px (${n}×)`).join(', ')}`);
  L.push('', '## Radius', '', radius.map((r) => `${r.name} = ${r.px === 9999 ? 'full' : r.px + 'px'}`).join(' · ') || 'none found');
  L.push('', '## Shadows', '', shadows.map((s) => `${s.name} = \`${s.key}\``).join('  \n') || 'none found');
  if (durations.length) L.push('', '## Motion', '', durations.map((d, i) => `duration/${durNames[i]} = ${d}ms`).join(' · ') + (easings.length ? ` · easing ${easings.join(', ')}` : ''));
  if (breakpoints.length) L.push('', `Breakpoints in the CSS: ${breakpoints.join(', ')}px. Max content width: ${containers.join(', ') || 'none'}px.`);
  L.push('', '## Components', '');
  const cdesc = {
    button: (b) => `${b.style} / ${b.size} "${b.label}" (${b.h}px, radius ${b.radius}${b.hover ? ', hover' : ''})`,
    input: (x) => `${x.size} "${x.placeholder}" (${x.h}px${x.focus ? ', focus' : ''})`,
    badge: (x) => `${x.style} "${x.label}"`,
    card: (x) => `${x.style} "${x.title}" (${x.w}px wide)`,
  };
  for (const [k, list] of Object.entries(components)) L.push(`- **${k}**: ${list.length ? list.map(cdesc[k]).join('; ') : 'none found'}`);
  const pg = roles.light['surface/page'], tp = roles.light['text/primary'];
  if (pg && tp && contrast(pg, tp) < 4.5) warnings.push(`text/primary on surface/page has a contrast of ${contrast(pg, tp).toFixed(2)}:1, below 4.5:1.`);
  const unread = lightScans.reduce((t, sc) => t + ((sc.stats || {}).unreadableSheets || 0), 0);
  if (unread) warnings.push(`${unread} stylesheet(s) could not be read (other origin), so hover and focus rules from them are missing. Computed values are unaffected.`);
  if (!components.button.length) warnings.push('No buttons were recognised.');

  if (opts.previous && opts.previous.primitives) {
    const prev = opts.previous;
    const diff = (a, b, key) => {
      const A = Object.fromEntries((a || []).map((x) => [x.name, key(x)]));
      const B = Object.fromEntries((b || []).map((x) => [x.name, key(x)]));
      return {
        added: Object.keys(B).filter((k) => !(k in A)),
        removed: Object.keys(A).filter((k) => !(k in B)),
        changed: Object.keys(B).filter((k) => k in A && A[k] !== B[k]).map((k) => `${k}: ${A[k]} → ${B[k]}`),
      };
    };
    const parts = [
      ['Palette', diff(prev.primitives, spec.primitives, (x) => x.hex)],
      ['Colour meanings', diff(prev.semantic, spec.semantic, (x) => `${x.light}${x.dark ? ' / ' + x.dark : ''}`)],
      ['Text styles', diff(prev.text, spec.text, (x) => `${x.family} ${x.weight} ${x.size}/${x.lh}`)],
      ['Spacing', diff(prev.space, spec.space, (x) => x.px)],
      ['Radius', diff(prev.radius, spec.radius, (x) => x.px)],
      ['Shadows', diff(prev.shadows, spec.shadows, (x) => JSON.stringify(x.layers))],
    ];
    L.push('', `## Changes since the last run (${prev.date || 'earlier'})`, '');
    let any = false;
    for (const [label, d] of parts) {
      if (!d.added.length && !d.removed.length && !d.changed.length) continue;
      any = true;
      L.push(`- **${label}**: ${[d.added.length ? `added ${d.added.join(', ')}` : '', d.removed.length ? `removed ${d.removed.join(', ')}` : '', d.changed.length ? `changed ${d.changed.join('; ')}` : ''].filter(Boolean).join('. ')}`);
    }
    if (!any) L.push('No token changes.');
  }
  if (warnings.length) L.push('', '## Warnings', '', ...warnings.map((w) => `- ${w}`));
  L.push('');

  // figma-spec.json keeps one top-level key per line, so figma-code.zsh can pass each Figma
  // step only the keys it uses
  const specText = `{\n${Object.entries(spec).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}`;
  return [JSON.stringify(tokens, null, 2), specText, L.join('\n')].join('\n@@STF@@\n');
})
