// Раздел «Прогресс» (п. 7 ТЗ): сводка за период и страница упражнения с графиком.

import * as G from '../core/progress.js';
import { fmtDate, fmtSet, fmtWeight, isoDate, plural } from '../core/util.js';
import { progressChart } from '../chart.js';
import { h, icon } from '../ui.js';

export const routes = [
  { path: /^progress$/, render: (ctx) => overviewPage(ctx, 1) },
  { path: /^progress\/(\d+)$/, render: (ctx, [m]) => overviewPage(ctx, Number(m)) },
  { path: /^progress\/(\d+)\/ex\/(\d+)$/, render: (ctx, [m, id]) => exercisePage(ctx, Number(m), Number(id)) },
];

function pct(v, { sign = true } = {}) {
  if (v == null) return null;
  const r = Math.round(v * 10) / 10;
  return `${sign && r > 0 ? '+' : ''}${String(r).replace('.', ',')}%`;
}

function pctChip(v) {
  if (v == null) return null;
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
  return h('span', { class: `pct ${cls}` }, pct(v));
}

function periodSwitch(months, hrefFor) {
  return h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Период' },
    G.PERIODS.map(p => h('a', { href: hrefFor(p.months), role: 'tab', 'aria-selected': p.months === months ? 'true' : 'false',
      class: p.months === months ? 'on' : '' }, p.label)));
}

function overviewPage(ctx, months) {
  const ov = G.overview(ctx.data, months, isoDate());
  const per = G.period(months);

  const stats = h('section', { class: 'panel progress-stats' },
    h('p', { class: 'muted small' }, `${fmtDate(ov.start)} — ${fmtDate(ov.end)}`),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' },
        h('span', { class: 'stat-value' }, ov.sessions),
        h('span', { class: 'stat-label' }, plural(ov.sessions, 'тренировка', 'тренировки', 'тренировок') +
          (ov.expected ? ` из ~${ov.expected} по плану` : ''))),
      ov.expected ? h('div', { class: 'meter', role: 'img', 'aria-label': `${ov.sessions} из ${ov.expected}` },
        h('div', { class: 'meter-fill', style: `width:${Math.min(100, Math.round(ov.sessions / ov.expected * 100))}%` })) : null),
    ov.breaks.length
      ? h('div', { class: 'breaks' }, h('p', { class: 'small strong' }, 'Перерывы больше недели'),
          h('ul', {}, ov.breaks.map(b => h('li', {},
            `${fmtDate(b.from)} — ${b.ongoing ? 'сейчас' : fmtDate(b.to)}`, h('span', { class: 'muted' }, ` · ${b.days} дн.`)))))
      : ov.sessions ? h('p', { class: 'small' }, 'Перерывов больше недели не было') : null);

  const list = ov.exercises.length
    ? h('ul', { class: 'ex-list' }, ov.exercises.map(p => h('li', { class: 'ex-row' },
        h('a', { class: 'ex-main prog-row', href: `#/progress/${months}/ex/${p.exercise.id}` },
          h('span', { class: 'ex-name' }, p.exercise.name,
            h('small', { class: 'ex-usage' }, p.points.length === 1
              ? `${fmtSet(p.last.best.weight, p.last.best.reps, p.bw)} · 1 тренировка`
              : `${fmtSet(p.first.best.weight, p.first.best.reps, p.bw)} → ${fmtSet(p.last.best.weight, p.last.best.reps, p.bw)}`)),
          pctChip(p.changePct),
          icon('chevron', 'icon chev')))))
    : h('p', { class: 'muted pad' }, `За ${per.label === '1 месяц' ? 'последний месяц' : 'последние 2 месяца'} тренировок с подходами нет.`);

  return {
    title: 'Прогресс',
    body: h('div', { class: 'stack' },
      periodSwitch(months, (m) => `#/progress/${m}`),
      stats,
      ov.exercises.length ? h('h3', { class: 'section-label' }, 'Лучший подход: первая → последняя тренировка периода') : null,
      list),
  };
}

function exercisePage(ctx, months, id) {
  const ex = ctx.data.get('exercises', id);
  const today = isoDate();
  const p = ex && G.exerciseProgress(ctx.data, ex, G.periodStart(months, today), today);
  if (!p) return ctx.redirect(`#/progress/${months}`);
  const bw = p.bw;
  const unit = bw ? 'повт.' : 'кг';

  const facts = [
    p.points.length > 1 ? ['Лучший подход',
      h('span', {}, `${fmtSet(p.first.best.weight, p.first.best.reps, bw)} → `,
        h('b', {}, fmtSet(p.last.best.weight, p.last.best.reps, bw)), ' ', pctChip(p.changePct))] : null,
    p.points.length > 1 ? ['Объём за тренировку',
      h('span', {}, `${fmtWeight(Math.round(p.first.volume))} → ${fmtWeight(Math.round(p.last.volume))} ${unit} `, pctChip(p.volumePct))] : null,
    ['Рекорд', h('span', {}, h('b', {}, fmtSet(p.pr.weight, p.pr.reps, bw)), ` · ${fmtDate(p.pr.date)}`)],
    ['Тренировок с упражнением', String(p.points.length)],
  ].filter(Boolean);

  return {
    title: 'Прогресс',
    back: `#/progress/${months}`,
    body: h('div', { class: 'stack' },
      h('h2', { class: 'ex-title' }, ex.name),
      periodSwitch(months, (m) => `#/progress/${m}/ex/${id}`),
      p.ofPrPct != null ? h('section', { class: 'of-pr' },
        h('span', { class: 'of-pr-value' }, `${Math.round(p.ofPrPct)}%`),
        h('span', { class: 'of-pr-label' }, 'от рекорда на последней тренировке',
          h('small', {}, `${fmtDate(p.last.date)}: ${fmtSet(p.last.best.weight, p.last.best.reps, bw)}`))) : null,
      progressChart(p),
      h('dl', { class: 'facts' }, facts.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
  };
}
