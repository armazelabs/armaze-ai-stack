/*
 * extract-elements.js - run inside a browser page (orca eval) by elements.zsh.
 *
 * Returns one JSON string describing the content and structure of the page as it
 * is drawn right now: headings, verbatim copy, navigation, links, buttons, every
 * form field (native and ARIA custom controls), tabs, tables, images and open
 * dialogs. Hidden elements are skipped; open shadow roots are walked. Values of
 * password, token, card and similar fields are masked. No styles are collected.
 *
 * Plain browser JavaScript, no dependencies. It is one expression, so keep it
 * wrapped in the arrow function below.
 */
(() => {
  const LIMITS = { copy: 400, text: 1000, links: 300, buttons: 200, images: 120, options: 60, rows: 3 };
  const SECRET = /pass|token|secret|api[-_ ]?key|otp|one.?time|cvc|cvv|card.?number|cc-number|iban|ssn/i;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'IFRAME', 'OBJECT', 'CANVAS']);

  const clean = (s, max = LIMITS.text) => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '...' : t;
  };

  // Every element, including those inside open shadow roots, in document order.
  const all = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);

  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false })) return false;
    } else if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  const byId = (el, id) => {
    const root = el.getRootNode();
    return (root.getElementById && root.getElementById(id)) || document.getElementById(id);
  };
  const idsText = (el, attr) => {
    const ids = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    return clean(ids.map((id) => { const n = byId(el, id); return n ? n.textContent : ''; }).join(' '));
  };

  // The nearest landmark. <header> and <footer> only count as page banner/footer
  // when they are not inside an article, aside, main, nav or section (as in ARIA).
  const LANDMARK = 'nav,header,footer,aside,main,form,dialog,[role=navigation],[role=banner],[role=contentinfo],[role=complementary],[role=main],[role=dialog],[role=search]';
  const landmark = (el) => {
    let l = el.closest(LANDMARK);
    while (l && (l.tagName === 'HEADER' || l.tagName === 'FOOTER') && !l.getAttribute('role') &&
           l.parentElement && l.parentElement.closest('article,aside,main,nav,section')) {
      l = l.parentElement.closest(LANDMARK);
    }
    if (!l) return 'body';
    const role = l.getAttribute('role') || l.tagName.toLowerCase();
    const name = l.getAttribute('aria-label') || (l.getAttribute('aria-labelledby') ? idsText(l, 'aria-labelledby') : '');
    return name ? `${role}: ${clean(name, 60)}` : role;
  };

  const accessibleName = (el) => {
    if (el.getAttribute('aria-labelledby')) {
      const t = idsText(el, 'aria-labelledby');
      if (t) return t;
    }
    if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
    if (el.labels && el.labels.length) {
      const t = clean([...el.labels].map((l) => l.innerText || l.textContent).join(' '));
      if (t) return t;
    }
    const wrap = el.closest('label');
    if (wrap) {
      const t = clean(wrap.innerText || wrap.textContent);
      if (t) return t;
    }
    if (el.getAttribute('title')) return clean(el.getAttribute('title'));
    return '';
  };

  const isSecret = (el, label) =>
    (el.type || '').toLowerCase() === 'password' ||
    SECRET.test([el.name, el.id, el.getAttribute('autocomplete'), label].filter(Boolean).join(' '));

  const page = {
    title: document.title,
    url: location.href,
    lang: document.documentElement.lang || '',
    description: (document.querySelector('meta[name="description"]') || {}).content || '',
    viewport: { width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight },
  };

  // Headings
  const headings = all
    .filter((el) => /^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading')
    .filter(visible)
    .map((el) => ({
      level: /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : Number(el.getAttribute('aria-level') || 2),
      text: clean(el.innerText || el.textContent, 300),
      region: landmark(el),
    }))
    .filter((h) => h.text);

  // Navigation blocks (menus, breadcrumbs, tab bars built from links)
  const navigation = all
    .filter((el) => el.tagName === 'NAV' || el.getAttribute('role') === 'navigation')
    .filter(visible)
    .map((nav) => ({
      label: clean(nav.getAttribute('aria-label') || idsText(nav, 'aria-labelledby'), 80),
      items: [...nav.querySelectorAll('a[href],button,[role=menuitem],[role=link]')]
        .filter(visible)
        .map((a) => ({
          text: clean(a.innerText || a.getAttribute('aria-label') || a.textContent, 120),
          href: a.href || '',
          current: a.getAttribute('aria-current') || undefined,
          expanded: a.getAttribute('aria-expanded') || undefined,
        }))
        .filter((i) => i.text),
    }));

  // Tab bars
  const tabs = all
    .filter((el) => el.getAttribute('role') === 'tablist' && visible(el))
    .map((list) => ({
      label: clean(list.getAttribute('aria-label') || idsText(list, 'aria-labelledby'), 80),
      tabs: [...list.querySelectorAll('[role=tab]')].map((t) => ({
        text: clean(t.innerText || t.getAttribute('aria-label'), 80),
        selected: t.getAttribute('aria-selected') === 'true',
        disabled: t.getAttribute('aria-disabled') === 'true' || t.disabled || undefined,
      })),
    }));

  // Links (not acting as buttons)
  const links = all
    .filter((el) => el.tagName === 'A' && el.hasAttribute('href') && el.getAttribute('role') !== 'button')
    .filter(visible)
    .map((a) => ({
      text: clean(a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || (a.querySelector('img') || {}).alt, 160),
      href: a.href,
      newTab: a.target === '_blank' || undefined,
      region: landmark(a),
    }))
    .filter((l) => l.text || l.href)
    .slice(0, LIMITS.links);

  // Buttons
  const buttonSel = 'button,input[type=button],input[type=submit],input[type=reset],input[type=image],[role=button]';
  const buttons = all
    .filter((el) => el.matches(buttonSel))
    .filter(visible)
    .map((b) => ({
      text: clean(b.innerText || b.value || b.getAttribute('aria-label') || b.getAttribute('title') || b.alt, 160),
      type: b.tagName === 'BUTTON' || b.tagName === 'INPUT' ? (b.type || 'submit') : 'role=button',
      disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' || undefined,
      opensPopup: b.getAttribute('aria-haspopup') || undefined,
      expanded: b.getAttribute('aria-expanded') || undefined,
      pressed: b.getAttribute('aria-pressed') || undefined,
      iconOnly: !clean(b.innerText || b.value) || undefined,
      classHint: clean(typeof b.className === 'string' ? b.className : '', 100) || undefined,
      form: b.form ? (b.form.id || b.form.name || 'form') : undefined,
      a11y: clean(b.innerText || b.value || b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.getAttribute('title') || b.alt) ? undefined : 'no accessible name',
      region: landmark(b),
    }))
    .slice(0, LIMITS.buttons);

  // Form fields: native controls plus ARIA custom controls
  const CUSTOM_ROLES = ['textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'radiogroup'];
  const native = (el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
  const fieldEls = all.filter((el) => {
    if (native(el)) return !['hidden', 'button', 'submit', 'reset', 'image'].includes((el.type || '').toLowerCase());
    if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return true;
    const role = el.getAttribute('role');
    return CUSTOM_ROLES.includes(role) && !el.querySelector('input,select,textarea');
  }).filter((el) => visible(el) || (native(el) && el.type && ['checkbox', 'radio', 'file'].includes(el.type) && visible(el.parentElement)));

  const describe = (el) => {
    const label = accessibleName(el);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    let type = native(el) ? (tag === 'input' ? (el.type || 'text') : tag) : (el.isContentEditable ? 'contenteditable' : `role=${role}`);
    if (native(el) && role === 'combobox') type = 'role=combobox';
    const fieldset = el.closest('fieldset');
    const legend = fieldset && fieldset.querySelector('legend');
    const f = {
      label: label || undefined,
      group: legend ? clean(legend.innerText, 120) : undefined,
      control: type,
      name: el.name || el.id || undefined,
      placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || undefined,
      required: el.required || el.getAttribute('aria-required') === 'true' || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
      readonly: el.readOnly || el.getAttribute('aria-readonly') === 'true' || undefined,
      invalid: el.getAttribute('aria-invalid') === 'true' || (el.validity && el.validity.valid === false && el.value !== '') || undefined,
      autocomplete: el.getAttribute('autocomplete') || undefined,
      pattern: el.getAttribute('pattern') || undefined,
      min: el.getAttribute('min') || el.getAttribute('aria-valuemin') || undefined,
      max: el.getAttribute('max') || el.getAttribute('aria-valuemax') || undefined,
      step: el.getAttribute('step') || undefined,
      minLength: el.getAttribute('minlength') || undefined,
      maxLength: el.getAttribute('maxlength') || undefined,
      multiple: el.multiple || el.getAttribute('aria-multiselectable') === 'true' || undefined,
      accept: el.getAttribute('accept') || undefined,
      help: idsText(el, 'aria-describedby') || undefined,
      error: idsText(el, 'aria-errormessage') || (el.validationMessage && el.value !== '' ? el.validationMessage : '') || undefined,
      expanded: el.getAttribute('aria-expanded') || undefined,
      a11y: label ? undefined : 'no accessible name',
      region: landmark(el),
    };
    if (tag === 'select') {
      f.options = [...el.options].slice(0, LIMITS.options).map((o) => ({ text: clean(o.text, 120), value: o.value, selected: o.selected || undefined, disabled: o.disabled || undefined }));
      if (el.options.length > LIMITS.options) f.optionsTruncated = el.options.length;
    } else if (type === 'checkbox' || type === 'role=checkbox' || type === 'role=switch') {
      f.checked = el.checked !== undefined ? el.checked : el.getAttribute('aria-checked');
    } else if (type === 'role=combobox' || type === 'role=listbox') {
      const listId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      const list = listId ? byId(el, listId) : (type === 'role=listbox' ? el : null);
      if (list) f.options = [...list.querySelectorAll('[role=option]')].slice(0, LIMITS.options).map((o) => ({ text: clean(o.innerText || o.textContent, 120), selected: o.getAttribute('aria-selected') === 'true' || undefined }));
      f.value = clean(el.value !== undefined ? el.value : el.textContent, 200) || undefined;
    } else if (type === 'role=slider' || type === 'role=spinbutton') {
      f.value = el.getAttribute('aria-valuetext') || el.getAttribute('aria-valuenow') || undefined;
    } else if (type !== 'radio' && type !== 'file') {
      const v = el.isContentEditable ? el.innerText : el.value;
      if (v) f.value = isSecret(el, label) ? '[masked]' : clean(v, 200);
    }
    return f;
  };

  // Radios collapse into one field per group.
  const fields = [];
  const radioGroups = new Map();
  for (const el of fieldEls) {
    const isRadio = (native(el) && el.type === 'radio') || el.getAttribute('role') === 'radio';
    if (!isRadio) {
      if (el.getAttribute('role') === 'radiogroup') continue;
      fields.push({ el, info: describe(el) });
      continue;
    }
    const groupEl = el.closest('[role=radiogroup],fieldset');
    const key = (native(el) && el.name) ? `name:${el.form ? el.form.id : ''}:${el.name}` : groupEl || el;
    if (!radioGroups.has(key)) {
      let label = '';
      if (groupEl) {
        const legend = groupEl.querySelector('legend');
        label = clean(groupEl.getAttribute('aria-label') || idsText(groupEl, 'aria-labelledby') || (legend && legend.innerText), 200);
      }
      const info = { label: label || undefined, control: 'radio', name: el.name || undefined, required: el.required || undefined, options: [], region: landmark(el) };
      radioGroups.set(key, info);
      fields.push({ el, info });
    }
    radioGroups.get(key).options.push({
      text: accessibleName(el) || clean(el.value, 120),
      checked: (el.checked || el.getAttribute('aria-checked') === 'true') || undefined,
      disabled: el.disabled || undefined,
    });
  }

  const formKey = (el) => {
    const f = el.form || el.closest('form,[role=form],[role=search]');
    return f || null;
  };
  const formMap = new Map();
  const loose = [];
  for (const { el, info } of fields) {
    const f = formKey(el);
    if (!f) { loose.push(info); continue; }
    if (!formMap.has(f)) formMap.set(f, []);
    formMap.get(f).push(info);
  }
  const forms = [...formMap.entries()].map(([f, list]) => {
    const heading = f.querySelector('h1,h2,h3,h4,h5,h6,[role=heading]');
    return {
      name: clean(f.getAttribute('aria-label') || idsText(f, 'aria-labelledby') || f.getAttribute('name') || f.id, 120) || undefined,
      heading: heading ? clean(heading.innerText, 200) : undefined,
      method: (f.getAttribute('method') || '').toUpperCase() || undefined,
      action: f.getAttribute('action') ? f.action : undefined,
      noValidate: f.noValidate || undefined,
      region: landmark(f),
      fields: list,
      actions: [...f.querySelectorAll(buttonSel)].filter(visible).map((b) => ({
        text: clean(b.innerText || b.value || b.getAttribute('aria-label'), 120),
        type: b.type || 'role=button',
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' || undefined,
      })),
    };
  });

  // Tables and grids
  const tables = all
    .filter((el) => (el.tagName === 'TABLE' || ['grid', 'table', 'treegrid'].includes(el.getAttribute('role'))) && visible(el))
    .map((t) => {
      const allRows = [...t.querySelectorAll('tr,[role=row]')];
      // The header row: one in <thead>, else a first row made only of header cells.
      const headRow = allRows.find((r) => r.closest('thead') || r.querySelector('[role=columnheader]')) ||
        (allRows[0] && !allRows[0].querySelector('td,[role=cell],[role=gridcell]') ? allRows[0] : null);
      const headers = headRow ? [...headRow.querySelectorAll('th,td,[role=columnheader]')].map((h) => clean(h.innerText, 80)) : [];
      const rows = allRows.filter((r) => r !== headRow && !r.closest('thead'));
      return {
        caption: clean((t.querySelector('caption') || {}).innerText || t.getAttribute('aria-label') || idsText(t, 'aria-labelledby'), 120) || undefined,
        headers,
        rowCount: rows.length,
        sampleRows: rows.slice(0, LIMITS.rows).map((r) => [...r.querySelectorAll('th,td,[role=cell],[role=gridcell],[role=rowheader]')].map((c) => clean(c.innerText, 80))),
        sortable: !!t.querySelector('[aria-sort]') || undefined,
      };
    });

  // Images and labelled icons
  const images = all
    .filter((el) => (el.tagName === 'IMG' || (el.getAttribute('role') === 'img')) && visible(el))
    .map((img) => {
      const src = img.currentSrc || img.src || '';
      return {
        alt: img.tagName === 'IMG' ? (img.hasAttribute('alt') ? img.alt : '[no alt]') : clean(img.getAttribute('aria-label') || idsText(img, 'aria-labelledby'), 160),
        src: src.startsWith('data:') ? 'data:...' : src,
        size: `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}`,
        region: landmark(img),
      };
    })
    .slice(0, LIMITS.images);

  // Open dialogs, drawers, menus, popovers
  const dialogs = all
    .filter((el) => el.matches('dialog[open],[role=dialog],[role=alertdialog],[role=menu],[role=listbox][aria-expanded],[popover]:popover-open') && visible(el))
    .map((d) => ({
      kind: d.getAttribute('role') || d.tagName.toLowerCase(),
      label: clean(d.getAttribute('aria-label') || idsText(d, 'aria-labelledby'), 160) || undefined,
      modal: d.getAttribute('aria-modal') === 'true' || undefined,
      text: clean(d.innerText, LIMITS.text),
    }));

  // Live messages (toasts, alerts, status lines)
  const messages = all
    .filter((el) => el.matches('[role=alert],[role=status],[aria-live=assertive],[aria-live=polite],output') && visible(el))
    .map((m) => ({ kind: m.getAttribute('role') || `live=${m.getAttribute('aria-live')}`, text: clean(m.innerText, 400) }))
    .filter((m) => m.text);

  // Verbatim copy: text grouped by its nearest non-inline container, so a sentence
  // with a link or bold word inside stays one entry. Text that is only a heading,
  // button, link or form label is left out; it is listed above.
  const SKIP_CONTAINER = 'h1,h2,h3,h4,h5,h6,[role=heading],button,[role=button],label,select,option,textarea,a,[role=tab],[role=menuitem],[role=option]';
  const blockOf = (node) => {
    let el = node.parentElement;
    while (el && el !== document.body) {
      const d = getComputedStyle(el).display;
      if (!d.startsWith('inline') && d !== 'contents') return el;
      el = el.parentElement || (el.getRootNode() && el.getRootNode().host);
    }
    return el;
  };
  const texts = new Map();
  const collectText = (root) => {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement;
      if (!p || SKIP_TAGS.has(p.tagName.toUpperCase()) || p.closest('script,style,noscript,template,svg')) continue;
      const block = blockOf(n);
      if (!block) continue;
      if (!texts.has(block)) texts.set(block, []);
      texts.get(block).push(n);
    }
  };
  // Join a block's text nodes. Separate items rendered side by side (inline list
  // items, links in a row) get a space; formatting inside a sentence does not.
  const FORMAT = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'MARK', 'CODE', 'SMALL', 'SUB', 'SUP', 'ABBR', 'Q', 'KBD', 'DFN', 'TIME', 'DATA']);
  const joinText = (block, nodes) => {
    let out = '';
    let prev = null;
    for (const n of nodes) {
      const v = n.nodeValue;
      if (prev && n.parentElement !== prev.parentElement && !/\s$/.test(out) && !/^[\s.,;:!?)\]}%]/.test(v)) {
        const own = (x) => { let e = x.parentElement; while (e && e !== block && FORMAT.has(e.tagName)) e = e.parentElement; return e; };
        if (own(n) !== own(prev)) out += ' ';
      }
      out += v;
      prev = n;
    }
    return out;
  };
  collectText(document.body);
  for (const el of all) if (el.shadowRoot) collectText(el.shadowRoot);

  const copy = [];
  for (const [block, nodes] of texts) {
    if (copy.length >= LIMITS.copy) break;
    if (!visible(block) || block.closest(SKIP_CONTAINER)) continue;
    const text = clean(joinText(block, nodes));
    if (!text) continue;
    // Skip a block whose only text is one link or button inside it.
    const only = block.querySelectorAll('a,button,[role=button],label');
    if (only.length === 1 && clean(only[0].innerText) === text) continue;
    copy.push({ tag: block.tagName.toLowerCase(), text, region: landmark(block) });
  }

  const strip = (v) => JSON.parse(JSON.stringify(v));
  return JSON.stringify(strip({
    page, headings, navigation, tabs, links, buttons,
    forms, fieldsOutsideForms: loose, tables, images, dialogs, messages, copy,
    counts: { headings: headings.length, links: links.length, buttons: buttons.length, forms: forms.length, fields: fields.length, copy: copy.length },
  }));
})()
