// Настройки: резервная копия (п. 9 ТЗ), хранилище, версия.

import { backupFileName, inspectBackup, makeBackup, restoreBackup } from '../backup.js';
import { fmtDate, isoDate, nowIso } from '../core/util.js';
import { APP_VERSION } from '../version.js';
import { confirmSheet, h, openSheet, toast } from '../ui.js';

export const routes = [{ path: /^settings$/, render: settingsPage }];

function settingsPage(ctx) {
  const last = ctx.data.meta.lastBackupAt;
  const lastText = last ? `Последняя копия: ${fmtDate(isoDate(new Date(last)))}.${new Date(last).getFullYear()}`
    : 'Копию ещё не сохраняли.';
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
    onchange: (e) => restoreFromFile(ctx, e.target) });

  return {
    title: 'Настройки',
    back: 'history',
    body: h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        h('h3', {}, 'Резервная копия'),
        h('p', { class: 'muted' }, 'Все данные хранятся только на этом телефоне. Сохраняй копию, чтобы не потерять историю ' +
          'при смене телефона или очистке браузера.'),
        h('p', {}, lastText),
        h('button', { class: 'btn primary wide', onclick: () => saveBackup(ctx) }, 'Сохранить копию'),
        h('button', { class: 'btn wide', onclick: () => fileInput.click() }, 'Восстановить из копии'),
        fileInput),
      h('section', { class: 'panel' },
        h('h3', {}, 'Хранилище'),
        storageInfo()),
      h('p', { class: 'muted small center' }, `Дневник тренировок · версия ${APP_VERSION}`)),
  };
}

function storageInfo() {
  const p = h('p', { class: 'muted' }, 'Проверяю…');
  (async () => {
    if (!navigator.storage?.persisted) { p.textContent = 'Браузер не сообщает о режиме хранения.'; return; }
    const persisted = await navigator.storage.persisted();
    p.textContent = persisted
      ? 'Данные защищены: браузер не удалит их сам при нехватке места.'
      : 'Браузер может удалить данные при нехватке места. Установи приложение на главный экран и регулярно сохраняй копию.';
  })();
  return p;
}

export async function saveBackup(ctx) {
  const backup = makeBackup(ctx.data);
  const name = backupFileName();
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' });

  // На телефоне удобнее сразу отправить (например, себе в «Избранное»), если браузер умеет
  if (navigator.canShare?.({ files: [file] })) {
    const how = await openSheet('Сохранить копию', (close) => h('div', { class: 'stack tight' },
      h('p', { class: 'muted' }, 'Можно отправить файл в мессенджер или облако, либо скачать на телефон.'),
      h('button', { class: 'btn primary wide', type: 'button', onclick: () => close('share') }, 'Отправить…'),
      h('button', { class: 'btn wide', type: 'button', onclick: () => close('download') }, 'Скачать файл')));
    if (!how) return false;
    if (how === 'share') {
      try {
        await navigator.share({ files: [file], title: 'Дневник тренировок: резервная копия' });
      } catch (e) {
        if (e.name === 'AbortError') return false;
        download(file);
      }
      return markSaved(ctx);
    }
  }
  download(file);
  return markSaved(ctx);
}

function markSaved(ctx) {
  ctx.data.setMeta('lastBackupAt', nowIso());
  toast('Копия сохранена');
  ctx.refresh();
  return true;
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function restoreFromFile(ctx, input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let obj, info;
  try {
    obj = JSON.parse(await file.text());
    info = inspectBackup(obj);
  } catch (e) {
    toast(e.name === 'SyntaxError' ? 'Это не файл резервной копии.' : e.message, { kind: 'error', ms: 4000 });
    return;
  }
  const last = info.lastSession ? `${fmtDate(info.lastSession)}.${info.lastSession.slice(0, 4)}` : '—';
  const choice = await openSheet('Восстановить из копии?', (close) => h('div', { class: 'stack tight' },
    h('p', {}, `В копии: тренировок ${info.sessions}, последняя ${last}, упражнений ${info.exercises}.`),
    h('p', { class: 'muted' }, 'Текущие данные на телефоне будут заменены данными из копии.'),
    h('button', { class: 'btn wide', type: 'button', onclick: () => close('save-first') }, 'Сначала сохранить текущие данные'),
    h('button', { class: 'btn danger wide', type: 'button', onclick: () => close('restore') }, 'Заменить данные')));
  if (!choice) return;
  if (choice === 'save-first') {
    const saved = await saveBackup(ctx);
    if (!saved) return;
    if (!await confirmSheet('Восстановить сейчас?', 'Текущие данные сохранены. Заменить их данными из копии?',
      { ok: 'Заменить', danger: true })) return;
  }
  await restoreBackup(ctx.data, obj);
  toast('Данные восстановлены');
  ctx.go('#/plan');
}
