// Мини-набор для интерфейса: создание элементов, нижние листы, подтверждения, уведомления.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  workout: '<path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" />',
  records: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM12 13v4M8 20h8M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3" />',
  progress: '<path d="M4 19h16M5 15l4-5 4 3 6-7" />',
  plan: '<path d="M7 4h10M7 4v16h10V4M10 9h4M10 13h4M10 17h2" />',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name, cls = 'icon') {
  const span = h('span', { class: cls, 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

// ---------------------------------------------------------------- нижний лист (диалог)

let sheetEl;

function sheetDialog() {
  if (!sheetEl) {
    sheetEl = h('dialog', { class: 'sheet', 'aria-modal': 'true' });
    document.body.append(sheetEl);
    sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) sheetEl.close('cancel'); });
  }
  return sheetEl;
}

/**
 * Показывает лист с содержимым. build(close, setError) возвращает DOM-узлы.
 * close(value) закрывает лист и завершает промис этим значением.
 */
export function openSheet(title, build) {
  const dlg = sheetDialog();
  return new Promise((resolve) => {
    let result;
    const close = (value) => { result = value; dlg.close(); };
    const err = h('p', { class: 'form-error', role: 'alert' });
    const setError = (msg) => { err.textContent = msg || ''; };
    dlg.replaceChildren(
      h('div', { class: 'sheet-head' },
        h('h2', {}, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', onclick: () => close(undefined) },
          icon('close'))),
      h('div', { class: 'sheet-body' }, build(close, setError), err),
    );
    dlg.addEventListener('close', () => resolve(result), { once: true });
    dlg.showModal();
    const first = dlg.querySelector('input:not([type=checkbox]), select, textarea');
    if (first && !first.dataset.noautofocus) setTimeout(() => first.focus(), 50);
  });
}

/** Форма в листе: fields — узлы, onSubmit(form) бросает InputError при ошибке. */
export function formSheet(title, { fields, submit = 'Сохранить', onSubmit }) {
  return openSheet(title, (close) => {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const setError = (msg) => { err.textContent = msg || ''; };
    const form = h('form', { class: 'form', novalidate: true }, fields, err,
      h('button', { class: 'btn primary wide', type: 'submit' }, submit));
    form.addEventListener('input', () => setError(''));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const value = onSubmit(form);
        close(value ?? true);
      } catch (ex) {
        if (ex.name === 'InputError' || ex.constructor?.name === 'InputError') setError(ex.message);
        else { console.error(ex); setError('Что-то пошло не так: ' + ex.message); }
      }
    });
    return form;
  });
}

export function confirmSheet(title, text, { ok = 'Да', danger = false } = {}) {
  return openSheet(title, (close) => h('div', { class: 'confirm' },
    h('p', {}, text),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Отмена'),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => close(true) }, ok)),
  )).then(Boolean);
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function numInput(name, value, { decimal = false, min, max, placeholder } = {}) {
  return h('input', {
    name, value: value ?? '', placeholder,
    inputmode: decimal ? 'decimal' : 'numeric', autocomplete: 'off',
    min, max, enterkeyhint: 'done', class: 'num',
  });
}

// ---------------------------------------------------------------- уведомления

export function toast(text, { kind = '', ms = 2600 } = {}) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}` }, text);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}
