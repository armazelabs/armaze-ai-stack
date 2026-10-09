/*
 * extract-assets.js - run inside a browser page (orca eval) by scan.zsh.
 *
 * Returns one JSON string with the page's logo and icons as standalone SVG markup,
 * ready for Figma's createNodeFromSvg: computed fill/stroke inlined on every shape
 * (so CSS-coloured and currentColor icons keep their colour), <use> sprite references
 * resolved, classes/styles/data attributes stripped. Icon-sized <img src=*.svg> files
 * are fetched when the browser allows it. A raster logo comes back as its URL only.
 *
 *   { logo: {kind: 'svg'|'img'|'none', svg?, src?, alt, w, h},
 *     icons: [{name, svg, w, h, n}], favicons: [url], skipped: n }
 *
 * Plain browser JavaScript, one expression (async: it may fetch SVG files).
 */
(async () => {
  const MAX_ICONS = 60;
  const MAX_SVG = 6000;
  const SHAPES = 'path,circle,ellipse,line,polyline,polygon,rect,text,tspan,use';
  const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity'];
  const DEFAULTS = { 'stroke-width': '1px', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'fill-rule': 'nonzero', 'clip-rule': 'nonzero', opacity: '1', 'fill-opacity': '1', 'stroke-opacity': '1', stroke: 'none' };

  const visible = (el) => {
    if (!el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const kebab = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  const serialize = (svg) => {
    const r = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    // inline computed paint, walking original and clone in step (same document order)
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    for (let i = 0; i < src.length && i < dst.length; i++) {
      const o = src[i], c = dst[i];
      if (o.matches(SHAPES)) {
        const cs = getComputedStyle(o);
        for (const p of PAINT) {
          const v = cs.getPropertyValue(p);
          if (!v || (DEFAULTS[p] === v && p !== 'stroke')) continue;
          c.setAttribute(p, v);
        }
      }
      for (const a of [...c.attributes]) {
        if (a.name === 'class' || a.name === 'style' || a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'role' || a.name === 'focusable' || a.name === 'tabindex') c.removeAttribute(a.name);
      }
    }
    // resolve <use href="#id"> to a copy of the referenced symbol or element
    for (const u of [...clone.querySelectorAll('use')]) {
      const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
      if (!href.startsWith('#')) { u.remove(); continue; }
      const ref = document.getElementById(href.slice(1));
      if (!ref) { u.remove(); continue; }
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const a of ['fill', 'stroke', 'stroke-width', 'transform']) if (u.getAttribute(a)) g.setAttribute(a, u.getAttribute(a));
      const kids = ref.tagName.toLowerCase() === 'symbol' ? [...ref.childNodes] : [ref];
      for (const k of kids) g.appendChild(k.cloneNode(true));
      if (ref.tagName.toLowerCase() === 'symbol' && ref.getAttribute('viewBox') && !clone.getAttribute('viewBox')) clone.setAttribute('viewBox', ref.getAttribute('viewBox'));
      u.replaceWith(g);
    }
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(Math.round(r.width)));
    clone.setAttribute('height', String(Math.round(r.height)));
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${Math.round(r.width)} ${Math.round(r.height)}`);
    let s = new XMLSerializer().serializeToString(clone).replace(/<!--[\s\S]*?-->/g, '').replace(/\s{2,}/g, ' ');
    return { svg: s, w: Math.round(r.width), h: Math.round(r.height) };
  };

  const iconName = (svg, i) => {
    const pick = (el) => el && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-icon') || el.getAttribute('data-testid'));
    let n = pick(svg) || (svg.querySelector('title') || {}).textContent;
    if (!n) {
      const cls = (svg.getAttribute('class') || '') + ' ' + (svg.parentElement ? svg.parentElement.getAttribute('class') || '' : '');
      const m = cls.match(/(?:^|\s)(?:icon|lucide|fa|bi|ri|ti|mdi|heroicon|tabler|ph|i)[-_]([a-z0-9-]+)/i);
      if (m) n = m[1];
    }
    if (!n) {
      // an icon-only control names its icon; next to visible text the icon is decoration
      const host = svg.closest('a,button,[role=button],[aria-label]');
      if (host && !(host.innerText || '').trim()) n = pick(host);
    }
    const k = kebab(n);
    return k && k !== 'icon' ? k : `icon-${i + 1}`;
  };

  // ---- logo -----------------------------------------------------------------------
  const header = document.querySelector('header,[role=banner],nav') || document.body;
  const logoHost = [
    ...header.querySelectorAll('a[href="/"],a[href="./"],[class*=logo i],[id*=logo i],[aria-label*=logo i],[aria-label*=home i]'),
    ...header.querySelectorAll(`a[href="${location.origin}/"],a[href="${location.origin}"]`),
  ].find(visible);
  let logo = { kind: 'none' };
  let logoSvg = null;
  const logoCand = logoHost ? (logoHost.matches('svg,img') ? logoHost : logoHost.querySelector('svg,img')) : header.querySelector('svg,img');
  if (logoCand && visible(logoCand)) {
    const r = logoCand.getBoundingClientRect();
    const alt = logoCand.getAttribute('alt') || logoCand.getAttribute('aria-label') || (logoHost && logoHost.getAttribute('aria-label')) || document.title;
    if (logoCand.tagName.toLowerCase() === 'svg') {
      logoSvg = logoCand;
      logo = { kind: 'svg', alt, ...serialize(logoCand) };
    } else {
      const src = logoCand.currentSrc || logoCand.src;
      logo = { kind: 'img', src, alt, w: Math.round(r.width), h: Math.round(r.height) };
      if (/\.svg(\?|#|$)|^data:image\/svg/i.test(src)) {
        try {
          const t = await (await fetch(src)).text();
          if (t.includes('<svg') && t.length < 200000) logo = { kind: 'svg', alt, svg: t.slice(t.indexOf('<svg')), w: logo.w, h: logo.h };
        } catch (_) { /* cross-origin: keep the URL */ }
      }
    }
  }

  // ---- icons ------------------------------------------------------------------------
  const icons = new Map();
  let skipped = 0;
  const svgs = [...document.querySelectorAll('svg')].filter((s) => !s.parentElement || !s.parentElement.closest('svg'));
  let i = 0;
  for (const svg of svgs) {
    if (svg === logoSvg || (logoSvg && logoSvg.contains(svg))) continue;
    if (!visible(svg)) continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.width > 64 || r.height > 64) continue;
    let out;
    try { out = serialize(svg); } catch (_) { skipped++; continue; }
    if (out.svg.length > MAX_SVG) { skipped++; continue; }
    const key = out.svg.replace(/\s(width|height)="[^"]*"/g, '');
    const hit = icons.get(key);
    if (hit) { hit.n++; continue; }
    if (icons.size >= MAX_ICONS) { skipped++; continue; }
    icons.set(key, { name: iconName(svg, i++), ...out, n: 1 });
  }
  // icon-sized <img src="*.svg">
  const imgs = [...document.querySelectorAll('img')].filter((im) => {
    if (!visible(im)) return false;
    const r = im.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8 && r.width <= 64 && r.height <= 64 && /\.svg(\?|#|$)/i.test(im.currentSrc || im.src) && im !== logoCand;
  }).slice(0, 30);
  const fetched = await Promise.allSettled(imgs.map(async (im) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    try { return await (await fetch(im.currentSrc || im.src, { signal: ctl.signal })).text(); } finally { clearTimeout(t); }
  }));
  fetched.forEach((f, j) => {
    if (f.status !== 'fulfilled' || !f.value.includes('<svg') || f.value.length > MAX_SVG) { skipped++; return; }
    const im = imgs[j];
    const r = im.getBoundingClientRect();
    let svg = f.value.slice(f.value.indexOf('<svg')).replace(/<!--[\s\S]*?-->/g, '').replace(/\s{2,}/g, ' ');
    if (!/\swidth=/.test(svg.slice(0, svg.indexOf('>')))) svg = svg.replace('<svg', `<svg width="${Math.round(r.width)}" height="${Math.round(r.height)}"`);
    const key = svg;
    if (icons.has(key)) { icons.get(key).n++; return; }
    if (icons.size >= MAX_ICONS) { skipped++; return; }
    const base = kebab(im.alt) || kebab(((im.currentSrc || im.src).split('/').pop() || '').replace(/\.svg.*$/i, ''));
    icons.set(key, { name: base || `icon-${i + 1}`, svg, w: Math.round(r.width), h: Math.round(r.height), n: 1 });
    i++;
  });

  // unique names
  const used = {};
  const list = [...icons.values()].sort((a, b) => b.n - a.n).map((ic) => {
    const n = used[ic.name] = (used[ic.name] || 0) + 1;
    return n > 1 ? { ...ic, name: `${ic.name}-${n}` } : ic;
  });

  const favicons = [...document.querySelectorAll('link[rel~=icon],link[rel=apple-touch-icon],link[rel=mask-icon]')].map((l) => l.href).slice(0, 6);

  return JSON.stringify({ v: 1, url: location.href, logo, icons: list, favicons, skipped });
})()
