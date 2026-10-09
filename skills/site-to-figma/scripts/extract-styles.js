/*
 * extract-styles.js - run inside a browser page (orca eval) by scan.zsh.
 *
 * Returns one JSON string with the page's design values as they are drawn right
 * now: every colour by where it is used (text, background, border, and on which
 * kind of element), each text style, the spacing, radius, shadow, motion and
 * container values, the CSS custom properties, @font-face fonts, media-query
 * breakpoints, dark-theme hints, and samples of buttons, inputs, badges, cards and
 * links with their hover/focus/disabled rules. Same-origin nav links come along so
 * the skill can pick the next pages to scan. Nothing is sent anywhere.
 *
 * Colours are #rrggbb or #rrggbbaa. Lengths are px numbers. Hidden elements are
 * skipped; open shadow roots are walked. Plain browser JavaScript, one expression.
 */
(() => {
  const MAX_EL = 8000;
  const STATE_RULES_MAX = 4000;

  // ---- colours ---------------------------------------------------------------
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;
  const colorCache = new Map();
  const toHex = (v) => {
    if (!v) return null;
    v = String(v).trim();
    if (colorCache.has(v)) return colorCache.get(v);
    let res = null;
    const m = v.match(RGB);
    if (m) {
      let a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] ? 100 : 1);
      if (a > 0.004) res = '#' + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]) + (a < 0.996 ? hex2(a * 255) : '');
    } else if (!/^(transparent|none|initial|inherit|currentcolor)$/i.test(v) && CSS.supports('color', v)) {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = v;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
      if (a > 0) res = '#' + hex2(r) + hex2(g) + hex2(b) + (a < 255 ? hex2(a) : '');
    }
    colorCache.set(v, res);
    return res;
  };
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };
  // Box-shadows split into a ring (0 0 0 Npx, used as a border) and real shadow layers,
  // with transparent filler layers dropped. A shadow is kept as "x y blur spread #hex[ inset]; ...".
  const parseShadow = (str) => {
    const out = { ring: null, shadow: null };
    if (!str || str === 'none') return out;
    const keep = [];
    for (const layer of str.split(/,(?![^(]*\))/)) {
      const cm = layer.match(/rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b/i);
      const hex = toHex(cm ? cm[0] : 'black');
      if (!hex) continue;
      const nums = (cm ? layer.replace(cm[0], '') : layer).match(/-?[\d.]+(px)?/g) || [];
      const [x = 0, y = 0, blur = 0, spread = 0] = nums.map((n) => px(n));
      const inset = /inset/.test(layer);
      if (!x && !y && !blur && !spread) continue;
      if (!x && !y && !blur && spread > 0) { if (!out.ring) out.ring = { hex, w: spread, inset }; continue; }
      keep.push(`${x} ${y} ${blur} ${spread} ${hex}${inset ? ' inset' : ''}`);
    }
    out.shadow = keep.length ? keep.join('; ') : null;
    return out;
  };
  const firstFamily = (stack) => (stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  const clean = (s, max = 60) => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '...' : t;
  };
  const bump = (map, key, by = 1) => { map[key] = (map[key] || 0) + by; };

  // ---- stylesheets: state rules, dark hints, @font-face, breakpoints, var names
  const stateRules = [];
  const darkSelectors = new Set();
  let darkMedia = false;
  const fontFaces = [];
  const breakpoints = {};
  const varNames = new Set();
  let unreadableSheets = 0;
  // :hover-style pseudo-classes, and the data-/aria- attributes headless UI kits use instead
  const STATE = /(?<!\\):(hover|focus-visible|focus-within|focus|active|disabled)\b|(?<!\\)\[data-(hover|focus-visible|focus|active|disabled)(?:[~|^$*]?=[^\]]*)?\]|(?<!\\)\[aria-(disabled)(?:=["']?true["']?)?\]/;
  const STATE_ALL = /(?<!\\):(hover|focus-visible|focus-within|focus|active|disabled|enabled)\b|(?<!\\)\[data-(hover|focus-visible|focus|active|disabled)(?:[~|^$*]?=[^\]]*)?\]|(?<!\\)\[aria-disabled(?:=["']?true["']?)?\]/g;
  // Selector text with every escaped character (Tailwind's \: \, \( ...) masked, same length.
  const mask = (sel) => sel.replace(/\\./g, '__');
  // Split a selector list on top-level commas, ignoring escaped ones and those inside :is(...).
  const splitSel = (sel) => {
    const m = mask(sel);
    const parts = [];
    let depth = 0, from = 0;
    for (let i = 0; i < m.length; i++) {
      if (m[i] === '(') depth++;
      else if (m[i] === ')') depth--;
      else if (m[i] === ',' && depth === 0) { parts.push(sel.slice(from, i)); from = i + 1; }
    }
    parts.push(sel.slice(from));
    return parts;
  };
  // The state must sit on the element itself: skip `.group:hover .x` and `:is(.group:hover *)`.
  const ownState = (part, idx) => {
    const m = mask(part);
    let depth = 0;
    for (let i = 0; i < idx; i++) { if (m[i] === '(') depth++; else if (m[i] === ')') depth--; }
    if (depth > 0) return false;
    return !/[\s>+~]/.test(m.slice(idx).replace(/\([^()]*(\([^()]*\))*[^()]*\)/g, '').trim());
  };
  const DARK_SEL = /(\.dark\b|\.theme-dark\b|\[data-theme[~|^$*]?=["']?dark|\[data-mode[~|^$*]?=["']?dark|\[data-color-scheme[~|^$*]?=["']?dark|\[data-bs-theme[~|^$*]?=["']?dark)/i;
  const ROOT_SEL = /^(:root|html|body|:host)(\s*,\s*(:root|html|body|:host))*$/i;
  const STATE_PROPS = ['background-color', 'background', 'color', 'border-color', 'box-shadow', 'opacity', 'text-decoration-line', 'outline-color', 'outline-width'];

  const noteMedia = (text) => {
    if (/prefers-color-scheme:\s*dark/i.test(text)) darkMedia = true;
    const re = /(?:(?:min|max)-width:\s*|width\s*(?:>=|<=|>|<)\s*)([\d.]+)(px|em|rem)/gi;
    let m;
    while ((m = re.exec(text))) {
      const v = Math.round(parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16));
      if (v >= 320 && v <= 2560) bump(breakpoints, v);
    }
  };

  const walkRules = (rules, parentSel, base) => {
    for (const r of rules) {
      try {
        if (r.constructor.name === 'CSSFontFaceRule' || r.type === 5) {
          const s = r.style;
          const src = s.getPropertyValue('src') || '';
          const url = (src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/) || [])[1] || '';
          let abs = '';
          try { abs = url ? new URL(url, base || location.href).href : ''; } catch (_) { abs = url; }
          fontFaces.push({
            family: firstFamily(s.getPropertyValue('font-family')),
            weight: s.getPropertyValue('font-weight') || '400',
            style: s.getPropertyValue('font-style') || 'normal',
            src: abs.startsWith('data:') ? 'data:' : abs.slice(0, 300),
          });
        } else if (r.selectorText !== undefined) {
          let sel = r.selectorText;
          if (parentSel) {
            const p = splitSel(parentSel).length > 1 ? `:is(${parentSel})` : parentSel;
            sel = sel.includes('&') ? sel.replace(/&/g, p) : `${p} ${sel}`;
          }
          const dm = sel.match(DARK_SEL);
          if (dm) darkSelectors.add(dm[1]);
          if (ROOT_SEL.test(sel.trim()) || dm) {
            for (let i = 0; i < r.style.length; i++) {
              const name = r.style[i];
              if (name.startsWith('--')) varNames.add(name);
            }
          }
          if (STATE.test(sel) && stateRules.length < STATE_RULES_MAX) {
            const decls = {};
            let any = false;
            for (const prop of STATE_PROPS) {
              const v = r.style.getPropertyValue(prop);
              if (v) { decls[prop] = v.trim(); any = true; }
            }
            if (any) {
              for (const part of splitSel(sel)) {
                const sm = part.match(STATE);
                if (!sm || !ownState(part, sm.index)) continue;
                // hover-while-disabled and the like describe a combination, not one state
                const m = mask(part);
                const top = [...part.matchAll(STATE_ALL)].filter((x) => {
                  let d = 0;
                  for (let i = 0; i < x.index; i++) { if (m[i] === '(') d++; else if (m[i] === ')') d--; }
                  return d === 0 && !/enabled/.test(x[0]);
                });
                if (new Set(top.map((x) => (x[1] || x[2] || 'disabled').replace(/-visible|-within/, ''))).size > 1) continue;
                const baseSel = part.replace(STATE_ALL, '').replace(/::?(before|after|placeholder|marker)\b/g, '').trim() || '*';
                stateRules.push({ base: baseSel, state: (sm[1] || sm[2] || sm[3]).replace('focus-visible', 'focus').replace('focus-within', 'focus'), decls });
              }
            }
          }
          if (r.cssRules && r.cssRules.length) walkRules(r.cssRules, sel, base);
        } else if (r.media && r.cssRules) {
          noteMedia(r.media.mediaText || '');
          walkRules(r.cssRules, parentSel, base);
        } else if (r.styleSheet) {
          // @import
          try { walkRules(r.styleSheet.cssRules, parentSel, r.styleSheet.href || base); } catch (_) { unreadableSheets++; }
        } else if (r.cssRules) {
          walkRules(r.cssRules, parentSel, base);
        }
      } catch (_) { /* one bad rule never stops the walk */ }
    }
  };
  const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets || [])];
  for (const sh of sheets) {
    let rules = null;
    try { rules = sh.cssRules; } catch (_) { unreadableSheets++; continue; }
    if (rules) walkRules(rules, '', sh.href || location.href);
  }

  // ---- elements ----------------------------------------------------------------
  const all = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'HEAD', 'TITLE', 'BR', 'WBR', 'SOURCE', 'TRACK', 'PARAM']);
  const IN_SVG = (el) => el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg';
  const visible = (el) => {
    if (!el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.replace(/\s+/g, ' ').trim();
  };

  const vw = innerWidth;
  const csCache = new Map();
  const cs = (el) => {
    let s = csCache.get(el);
    if (!s) { s = getComputedStyle(el); csCache.set(el, s); }
    return s;
  };
  const bgCache = new Map();
  const effBg = (el) => {
    let e = el;
    const chain = [];
    while (e && e.nodeType === 1) {
      if (bgCache.has(e)) { const v = bgCache.get(e); chain.forEach((c) => bgCache.set(c, v)); return v; }
      chain.push(e);
      const b = toHex(cs(e).backgroundColor);
      if (b && b.length === 7) { chain.forEach((c) => bgCache.set(c, b)); return b; }
      e = e.parentElement || (e.getRootNode && e.getRootNode().host) || null;
    }
    chain.forEach((c) => bgCache.set(c, null));
    return null;
  };

  const TEXT_INPUT = /^(text|email|search|url|tel|password|number|date|datetime-local|month|week|time)$/i;
  const isInput = (el) =>
    el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && TEXT_INPUT.test(el.type || 'text'));
  const isButtonEl = (el) =>
    el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ||
    (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type));

  const region = (el) => {
    if (el.closest('header,nav,[role=banner],[role=navigation]')) return 'nav';
    if (el.closest('footer,[role=contentinfo]')) return 'footer';
    return 'main';
  };

  const colors = {};
  const addColor = (hex, kind, role, w = 1) => {
    if (!hex) return;
    const c = colors[hex] || (colors[hex] = { n: 0, text: 0, bg: 0, border: 0, roles: {} });
    c.n += w;
    c[kind] += w;
    bump(c.roles, `${kind}:${role}`, w);
  };
  const type = {};
  const space = {};
  const radius = {};
  const shadow = {};
  const borderW = {};
  const durations = {};
  const easings = {};
  const containers = {};
  const gradients = {};
  const comps = { button: {}, input: {}, badge: {}, card: {}, link: {} };
  const compEls = new Map();

  const snap = (el, s, r) => {
    let bw = s.borderTopStyle !== 'none' ? px(s.borderTopWidth) : 0;
    let bc = bw ? toHex(s.borderTopColor) : null;
    const sp = parseShadow(s.boxShadow);
    if (!bc && sp.ring) { bc = sp.ring.hex; bw = sp.ring.w; }
    const rad = px(s.borderTopLeftRadius);
    return {
      bg: toHex(s.backgroundColor),
      fg: toHex(s.color),
      bc: bc || null,
      bw: bc ? bw : 0,
      r: s.borderTopLeftRadius.endsWith('%') || (r.height > 0 && rad >= r.height / 2 - 0.5) ? 'full' : rad,
      pt: px(s.paddingTop), pr: px(s.paddingRight), pb: px(s.paddingBottom), pl: px(s.paddingLeft),
      ff: firstFamily(s.fontFamily), fs: px(s.fontSize), fw: s.fontWeight,
      lh: s.lineHeight === 'normal' ? null : px(s.lineHeight),
      ls: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
      tt: s.textTransform === 'none' ? null : s.textTransform,
      td: (s.textDecorationLine || 'none') === 'none' ? null : s.textDecorationLine,
      h: Math.round(r.height), w: Math.round(r.width),
      sh: sp.shadow,
      gap: s.display.includes('flex') || s.display.includes('grid') ? px(s.columnGap) || px(s.rowGap) || 0 : 0,
      grad: s.backgroundImage.includes('gradient(') ? s.backgroundImage.slice(0, 300) : null,
    };
  };
  const addComp = (kind, el, s, r, text, extra) => {
    const st = snap(el, s, r);
    if (extra) Object.assign(st, extra);
    const sigObj = kind === 'card'
      ? [st.bg, st.bc, st.bw, st.r, st.sh, st.pt, st.pl]
      : kind === 'link'
        ? [st.fg, st.td, st.fw]
        : [st.bg, st.fg, st.bc, st.bw, st.r, st.pt, st.pl, st.fs, st.fw, Math.round(st.h / 2) * 2, st.sh, !!el.disabled];
    const sig = JSON.stringify(sigObj);
    const g = comps[kind][sig];
    if (g) { g.n++; return; }
    comps[kind][sig] = { n: 1, text: clean(text, 40), disabled: !!el.disabled, region: region(el), st };
    compEls.set(comps[kind][sig], el);
  };

  let scanned = 0;
  for (const el of all) {
    if (scanned >= MAX_EL) break;
    if (SKIP.has(el.tagName) || IN_SVG(el)) continue;
    if (!visible(el)) continue;
    scanned++;
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const tag = el.tagName;
    const text = ownText(el);
    const hasText = !!text || (isInput(el) && !!(el.placeholder || el.value));
    const inButton = !isButtonEl(el) && el.closest('button,[role=button]');
    const btn = isButtonEl(el) ? el : null;
    const link = tag === 'A' ? el : null;

    // role used to weigh colours
    let role = 'body';
    if (/^H[1-6]$/.test(tag) || el.getAttribute('role') === 'heading') role = 'heading';
    else if (btn || inButton) role = 'button';
    else if (link || el.closest('a')) role = 'link';
    else if (isInput(el)) role = 'input';
    if (role === 'body' && region(el) === 'nav') role = 'nav';
    if (role === 'body' && region(el) === 'footer') role = 'footer';

    if (hasText) {
      addColor(toHex(s.color), 'text', role);
      const fam = firstFamily(s.fontFamily);
      const lh = s.lineHeight === 'normal' ? 'normal' : px(s.lineHeight);
      const ls = s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing);
      const tt = s.textTransform === 'none' ? '' : s.textTransform;
      const key = [fam, px(s.fontSize), s.fontWeight, lh, ls, tt, s.fontStyle === 'italic' ? 'i' : ''].join('|');
      const t = type[key] || (type[key] = { family: fam, stack: s.fontFamily.slice(0, 200), size: px(s.fontSize), weight: s.fontWeight, lh, ls, tt, italic: s.fontStyle === 'italic', n: 0, chars: 0, tags: {}, roles: {}, sample: '' });
      t.n++;
      t.chars += (text || el.placeholder || '').length;
      bump(t.tags, tag.toLowerCase());
      bump(t.roles, role);
      if (!t.sample && text.length > 3) t.sample = clean(text, 50);
    }

    const bg = toHex(s.backgroundColor);
    if (bg) {
      let bgRole = role === 'button' || btn ? 'button' : role === 'input' ? 'input' : region(el) === 'nav' ? 'nav' : 'other';
      if (bgRole === 'other' && r.width >= vw * 0.9) bgRole = 'section';
      addColor(bg, 'bg', bgRole, r.width * r.height > 40000 ? 2 : 1);
    }
    const bwTop = s.borderTopStyle !== 'none' ? px(s.borderTopWidth) : 0;
    const bwBottom = s.borderBottomStyle !== 'none' ? px(s.borderBottomWidth) : 0;
    const bwLeft = s.borderLeftStyle !== 'none' ? px(s.borderLeftWidth) : 0;
    const sp = parseShadow(s.boxShadow);
    if (sp.ring) {
      addColor(sp.ring.hex, 'border', role === 'input' ? 'input' : role === 'button' ? 'button' : 'other');
      bump(borderW, sp.ring.w);
    }
    const bwAny = bwTop || bwBottom || bwLeft || (sp.ring ? sp.ring.w : 0);
    if (bwTop || bwBottom || bwLeft) {
      const bc = toHex(bwTop ? s.borderTopColor : bwBottom ? s.borderBottomColor : s.borderLeftColor);
      addColor(bc, 'border', role === 'input' ? 'input' : role === 'button' ? 'button' : 'other');
      bump(borderW, bwAny);
    }

    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
      const v = Math.round(px(s[p]));
      if (v > 0 && v <= 400) {
        const e = space[v] || (space[v] = { n: 0, pad: 0, margin: 0, gap: 0 });
        e.n++;
        e[p.startsWith('pad') ? 'pad' : 'margin']++;
      }
    }
    if (s.display.includes('flex') || s.display.includes('grid')) {
      for (const p of ['rowGap', 'columnGap']) {
        const v = Math.round(px(s[p]));
        if (v > 0 && v <= 400) {
          const e = space[v] || (space[v] = { n: 0, pad: 0, margin: 0, gap: 0 });
          e.n++;
          e.gap++;
        }
      }
    }

    const visibleBox = bg || bwAny || sp.shadow || tag === 'IMG' || s.overflow !== 'visible';
    if (visibleBox) {
      const rr = s.borderTopLeftRadius;
      if (rr && rr !== '0px') {
        const v = rr.endsWith('%') ? (parseFloat(rr) >= 50 ? 'full' : null) : (px(rr) >= Math.min(r.width, r.height) / 2 - 0.5 && px(rr) >= 8 ? 'full' : px(rr));
        if (v !== null) bump(radius, v);
      }
    }
    if (sp.shadow) bump(shadow, sp.shadow);
    if (s.transitionDuration && s.transitionDuration !== '0s') {
      bump(durations, s.transitionDuration.split(',')[0].trim());
      bump(easings, (s.transitionTimingFunction || '').split(/,(?![^(]*\))/)[0].trim());
    }
    if (s.maxWidth.endsWith('px') && r.width >= 480 && Math.abs(px(s.marginLeft) - px(s.marginRight)) < 2 && px(s.marginLeft) > 0) bump(containers, Math.round(px(s.maxWidth)));
    if (s.backgroundImage.includes('gradient(')) bump(gradients, s.backgroundImage.slice(0, 300));

    // components
    let labelText;
    const label = () => (labelText ??= clean(el.innerText || el.value || el.getAttribute('aria-label') || '', 40));
    if (btn && r.height >= 20 && r.height <= 80 && r.width < 500 && (bg || bwAny || sp.shadow || px(s.paddingLeft) >= 6) && label()) {
      addComp('button', el, s, r, label());
    } else if (link && r.height >= 24 && r.height <= 72 &&
               s.display !== 'inline' && (bg || bwAny) && px(s.paddingLeft) >= 8 && label() && label().length < 40 && !link.querySelector('img,picture,video')) {
      addComp('button', el, s, r, label());
    } else if (link && text && s.display === 'inline' && role === 'link' && region(el) === 'main' && el.closest('p,li,td,dd,blockquote')) {
      addComp('link', el, s, r, text);
    } else if (isInput(el) && r.height >= 24 && r.width >= 80) {
      let ph = null;
      try { ph = toHex(getComputedStyle(el, '::placeholder').color); } catch (_) { /* no placeholder pseudo */ }
      addComp('input', el, s, r, el.placeholder || el.getAttribute('aria-label') || el.tagName.toLowerCase(), { ph, kind: el.tagName === 'INPUT' ? el.type : el.tagName.toLowerCase() });
    } else if (!inButton && !link && !btn && r.height >= 14 && r.height <= 34 && r.width < 220 && el.children.length <= 2 &&
               px(s.borderTopLeftRadius) > 0 && ((bg && bg !== effBg(el.parentElement)) || bwAny) && label() && label().length <= 24) {
      addComp('badge', el, s, r, label());
    } else if (/^(DIV|ARTICLE|LI|SECTION|A|ASIDE)$/.test(tag) && r.width >= 180 && r.width <= Math.min(900, vw * 0.85) && r.height >= 80 && r.height <= 1400 &&
               (sp.shadow || (bwAny && px(s.borderTopLeftRadius) > 0) || (bg && px(s.borderTopLeftRadius) > 0 && bg !== effBg(el.parentElement))) &&
               (el.innerText || '').trim().length > 10) {
      const heading = el.querySelector('h1,h2,h3,h4,h5,h6,strong,[class*=title i]');
      addComp('card', el, s, r, heading ? heading.innerText : el.innerText);
    }
  }

  // ---- states for each component sample ------------------------------------------
  const resolveVars = (val, el) => {
    let out = val;
    for (let i = 0; i < 4 && out.includes('var('); i++) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fb) => {
        const v = getComputedStyle(el).getPropertyValue(name).trim();
        return v || (fb || '').trim();
      });
    }
    return out;
  };
  const stateOf = (el) => {
    const out = {};
    for (const rule of stateRules) {
      let hit = false;
      try { hit = rule.base === '*' ? false : el.matches(rule.base); } catch (_) { hit = false; }
      if (!hit) continue;
      const o = out[rule.state] || (out[rule.state] = {});
      for (const [prop, raw] of Object.entries(rule.decls)) {
        const v = resolveVars(raw, el);
        if (prop === 'background-color' || prop === 'background') { const h = toHex(v); if (h) o.bg = h; }
        else if (prop === 'color') { const h = toHex(v); if (h) o.fg = h; }
        else if (prop === 'border-color') { const h = toHex(v.split(' ')[0]); if (h) o.bc = h; }
        else if (prop === 'outline-color') { const h = toHex(v); if (h) o.oc = h; }
        else if (prop === 'outline-width') o.ow = px(v);
        else if (prop === 'box-shadow') { const p2 = parseShadow(v); if (p2.shadow) o.sh = p2.shadow; if (p2.ring) o.bc = p2.ring.hex; }
        else if (prop === 'opacity') o.op = parseFloat(v);
        else if (prop === 'text-decoration-line') o.td = v;
      }
    }
    for (const k of Object.keys(out)) if (!Object.keys(out[k]).length) delete out[k];
    return Object.keys(out).length ? out : undefined;
  };
  const components = {};
  for (const [kind, groups] of Object.entries(comps)) {
    components[kind] = Object.values(groups)
      .sort((a, b) => b.n - a.n)
      .slice(0, kind === 'link' ? 4 : 16)
      .map((g) => {
        const el = compEls.get(g);
        if (el && kind !== 'card') g.states = stateOf(el);
        return g;
      });
  }

  // ---- custom properties, fonts, root, nav links ------------------------------------
  const rootCs = getComputedStyle(document.documentElement);
  const vars = {};
  let varCount = 0;
  for (const name of varNames) {
    if (varCount >= 800) break;
    const v = rootCs.getPropertyValue(name).trim();
    if (!v || v.length > 200) continue;
    const hex = CSS.supports('color', v) ? toHex(v) : null;
    if (hex) { vars[name] = { v, hex }; varCount++; }
    else if (/^-?[\d.]+(px|rem|em)$/.test(v)) { vars[name] = { v, px: v.endsWith('px') ? px(v) : px(v) * 16 }; varCount++; }
    else if (/,/.test(v) && /(sans|serif|mono|system|["'])/i.test(v)) { vars[name] = { v, font: firstFamily(v) }; varCount++; }
  }

  const loaded = [];
  try {
    for (const f of document.fonts) {
      if (f.status === 'loaded') loaded.push({ family: f.family.replace(/^["']|["']$/g, ''), weight: f.weight, style: f.style });
    }
  } catch (_) { /* FontFaceSet not iterable */ }

  const htmlCs = rootCs;
  const bodyCs = document.body ? getComputedStyle(document.body) : htmlCs;
  const schemeDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const canvasDefault = schemeDark && /dark/.test(htmlCs.colorScheme || '') ? '#121212' : '#ffffff';
  const rootBg = (() => { const b = toHex(bodyCs.backgroundColor); if (b && b.length === 7) return b; const h = toHex(htmlCs.backgroundColor); return h && h.length === 7 ? h : canvasDefault; })();
  const rootFg = toHex(bodyCs.color) || '#000000';
  addColor(rootBg, 'bg', 'page', 50);

  const nav = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('header a[href], nav a[href], [role=navigation] a[href], footer a[href], main a[href]')) {
    if (nav.length >= 80) break;
    let u;
    try { u = new URL(a.href, location.href); } catch (_) { continue; }
    if (u.origin !== location.origin || /^(mailto|tel|javascript):/.test(a.href)) continue;
    const path = u.pathname.replace(/\/$/, '') || '/';
    if (seen.has(path) || /\.(pdf|zip|png|jpe?g|svg|xml)$/i.test(path)) continue;
    seen.add(path);
    nav.push({ text: clean(a.innerText || a.getAttribute('aria-label') || '', 40), path, region: region(a) });
  }

  const themeToggle = !![...document.querySelectorAll('button,[role=button],[role=switch]')].find((b) =>
    /theme|dark|light mode|color mode|appearance/i.test([b.getAttribute('aria-label'), b.title, b.innerText].join(' ')));

  return JSON.stringify({
    v: 1,
    sig: `${rootBg}|${rootFg}`,
    url: location.href,
    title: document.title,
    scheme: schemeDark ? 'dark' : 'light',
    viewport: { w: innerWidth, h: innerHeight, page: document.documentElement.scrollHeight },
    root: { bg: rootBg, fg: rootFg, font: firstFamily(bodyCs.fontFamily), stack: bodyCs.fontFamily.slice(0, 200), size: px(bodyCs.fontSize), colorScheme: htmlCs.colorScheme || '' },
    theme: { darkMedia, darkSelectors: [...darkSelectors].slice(0, 10), toggle: themeToggle, htmlClass: document.documentElement.className.toString().slice(0, 200), dataTheme: document.documentElement.getAttribute('data-theme') || '' },
    stats: { elements: all.length, scanned, unreadableSheets, stateRules: stateRules.length },
    colors, type: Object.values(type).sort((a, b) => b.n - a.n).slice(0, 120),
    space, radius, shadow, borderW, motion: { durations, easings }, containers, gradients,
    breakpoints, vars, fonts: { faces: fontFaces.slice(0, 80), loaded: loaded.slice(0, 80) },
    components, nav,
  });
})()
