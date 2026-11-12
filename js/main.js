// Точка входа: открывает базу, рисует оболочку, управляет переходами между экранами.

import { Data } from './data.js';
import { IdbPersist, openDb } from './db.js';
import { backupReminderNeeded } from './backup.js';
import { h, icon, toast } from './ui.js';
import * as plan from './sections/plan.js';
import * as settings from './sections/settings.js';
import * as workout from './sections/workout.js';
import * as records from './sections/records.js';
import * as progress from './sections/progress.js';
import { autofinishStale } from './core/workouts.js';

// Разделы подключаются здесь. Новый раздел = модуль с routes + вкладка в TABS.
const SECTIONS = [workout, records, progress, plan, settings];
const TABS = [
  { id: 'workout', label: 'Тренировка', icon: 'workout' },
  { id: 'records', label: 'Рекорды', icon: 'records' },
  { id: 'progress', label: 'Прогресс', icon: 'progress' },
  { id: 'plan', label: 'План', icon: 'plan' },
];
const DEFAULT_ROUTE = 'workout';

const app = document.getElementById('app');
let data;
let reminderDismissed = false;

const ctx = {
  get data() { return data; },
  refresh: () => render(),
  go: (hash) => { if (location.hash === hash) render(); else location.hash = hash; },
  redirect: (hash) => { queueMicrotask(() => ctx.go(hash)); return { title: '', body: h('div') }; },
};

function currentPath() {
  return location.hash.replace(/^#\/?/, '') || DEFAULT_ROUTE;
}

function resolve(path) {
  for (const section of SECTIONS) {
    for (const r of section.routes) {
      const m = path.match(r.path);
      if (m) return () => r.render(ctx, m.slice(1));
    }
  }
  return null;
}

function render() {
  const path = currentPath();
  const route = resolve(path);
  if (!route) { location.hash = `#/${DEFAULT_ROUTE}`; return; }
  const view = route();
  const tab = path.split('/')[0];

  const header = h('header', { class: 'topbar' },
    view.back === 'history'
      ? h('button', { class: 'icon-btn', 'aria-label': 'Назад',
          onclick: () => (history.length > 1 ? history.back() : ctx.go(`#/${DEFAULT_ROUTE}`)) }, icon('back'))
      : view.back
        ? h('a', { class: 'icon-btn', href: view.back, 'aria-label': 'Назад' }, icon('back'))
        : h('span', { class: 'topbar-spacer' }),
    h('h1', {}, view.title),
    tab === 'settings'
      ? h('span', { class: 'topbar-spacer' })
      : h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Настройки' }, icon('settings')));

  const banner = !reminderDismissed && backupReminderNeeded(data)
    ? h('div', { class: 'banner' },
        h('span', {}, 'Пора сохранить резервную копию — данные есть только на этом телефоне.'),
        h('div', { class: 'banner-actions' },
          h('a', { class: 'btn small primary', href: '#/settings' }, 'Сохранить'),
          h('button', { class: 'btn small ghost', onclick: () => { reminderDismissed = true; render(); } }, 'Позже')))
    : null;

  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Разделы' }, TABS.map(t =>
    h('a', { href: `#/${t.id}`, class: `tab ${tab === t.id ? 'active' : ''}`,
      'aria-current': tab === t.id ? 'page' : null }, icon(t.icon), h('span', {}, t.label))));

  const main = h('main', { class: 'view', id: 'view' }, banner, view.body);
  app.replaceChildren(header, main, nav);
  document.title = `${view.title} · Дневник тренировок`;
}

async function boot() {
  try {
    const db = await openDb();
    data = new Data(new IdbPersist(db));
    await data.load();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'Не удалось открыть данные'),
      h('p', {}, e.message || String(e)),
      h('p', { class: 'muted' }, 'Проверь, что браузер не в режиме инкогнито, и обнови страницу.')));
    return;
  }
  data.onError = () => toast('Не удалось сохранить изменение. Обнови страницу.', { kind: 'error', ms: 5000 });

  // Просим браузер не удалять данные при нехватке места
  navigator.storage?.persist?.().catch(() => {});

  window.addEventListener('hashchange', render);
  render();
  checkStaleWorkouts();
  // Приложение могли свернуть вчера и открыть сегодня — проверяем при возвращении
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkStaleWorkouts();
  });
  registerServiceWorker();
}

async function checkStaleWorkouts() {
  const summaries = autofinishStale(data);
  if (!summaries.length) return;
  render();
  await workout.showAutoFinished(summaries);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => {
      const bar = h('div', { class: 'update' },
        h('span', {}, 'Доступна новая версия'),
        h('button', { class: 'btn small primary', onclick: () => worker.postMessage('skipWaiting') }, 'Обновить'));
      document.body.append(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch((e) => console.warn('Service worker не зарегистрирован', e));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

boot();
