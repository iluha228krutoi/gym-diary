// Раздел «Рекорды» (п. 6 ТЗ): лучший подход по каждому упражнению и таблицы рекордов.

import * as R from '../core/records.js';
import { fmtDate, fmtSet, fmtWeight } from '../core/util.js';
import { h, icon } from '../ui.js';

export const routes = [
  { path: /^records$/, render: listPage },
  { path: /^records\/(\d+)$/, render: exercisePage },
];

function listPage(ctx) {
  const items = R.exercisesWithHistory(ctx.data).map(ex => ({
    ex, best: R.bestSet(R.exerciseHistory(ctx.data, ex.id), ex.isBodyweight),
  }));
  if (!items.length) {
    return {
      title: 'Рекорды',
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Рекордов пока нет'),
        h('p', {}, 'Они появятся после первых тренировок. Новый рекорд отмечается 🏆 прямо во время подхода.'),
        h('a', { class: 'btn primary', href: '#/workout' }, 'К тренировке')),
    };
  }
  return {
    title: 'Рекорды',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Лучший подход по каждому упражнению. Нажми, чтобы увидеть таблицу рекордов.'),
      h('ul', { class: 'ex-list' }, items.map(({ ex, best }) => h('li', { class: 'ex-row' },
        h('a', { class: 'ex-main rec-row', href: `#/records/${ex.id}` },
          h('span', { class: 'ex-name' }, ex.name, h('small', { class: 'ex-usage' }, fmtDate(best.date))),
          h('span', { class: 'rec-best' }, fmtSet(best.weight, best.reps, ex.isBodyweight)),
          icon('chevron', 'icon chev')))))),
  };
}

function exercisePage(ctx, [id]) {
  const ex = ctx.data.get('exercises', Number(id));
  const history = ex ? R.exerciseHistory(ctx.data, ex.id) : [];
  if (!history.length) return ctx.redirect('#/records');
  const bw = ex.isBodyweight;
  const best = R.bestSet(history, bw);
  const table = R.repTable(history, bw);
  const sessions = new Set(history.map(s => s.sessionId)).size;

  return {
    title: 'Рекорды',
    back: '#/records',
    body: h('div', { class: 'stack' },
      h('section', { class: 'rec-hero' },
        h('h2', { class: 'ex-title' }, ex.name),
        h('p', { class: 'rec-hero-label' }, 'Лучший подход'),
        h('p', { class: 'rec-hero-value' }, fmtSet(best.weight, best.reps, bw)),
        h('p', { class: 'muted' }, `${fmtDate(best.date)}.${best.date.slice(0, 4)} · всего тренировок с упражнением: ${sessions}`)),
      h('table', { class: 'rec-table' },
        h('caption', {}, bw ? 'Максимум повторов с доп. весом не меньше указанного'
          : 'Лучший вес, поднятый минимум на указанное число повторов'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, bw ? 'Доп. вес' : 'Повторы'),
          h('th', { scope: 'col' }, bw ? 'Повторы' : 'Вес'),
          h('th', { scope: 'col' }, 'Дата'))),
        h('tbody', {}, table.map(r => h('tr', {},
          h('td', {}, bw ? (r.key > 0 ? `+${fmtWeight(r.key)} кг` : 'свой вес') : r.key),
          h('td', { class: 'strong' }, bw ? r.value : `${fmtWeight(r.value)} кг`),
          h('td', { class: 'muted' }, fmtDate(r.date))))))),
  };
}
