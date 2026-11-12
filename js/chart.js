// График прогресса упражнения в SVG — без библиотек, работает без интернета.
// Одна линия по тренировкам, пунктир рекорда, подписи реальных подходов на ключевых точках,
// нажатие на точку показывает её значение под графиком.

import { e1rm } from './core/records.js';
import { strength } from './core/progress.js';
import { fmtDate, fmtSet, parseIso } from './core/util.js';
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 360, H = 230;
const PAD = { top: 26, right: 14, bottom: 30, left: 40 };

function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => span / st <= count) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** progress — результат exerciseProgress(). Возвращает узел с графиком и строкой значения. */
export function progressChart(progress) {
  const { points, bw, pr } = progress;
  const xs = points.map(p => parseIso(p.date).getTime());
  const ys = points.map(p => strength(p.best, bw));
  const prY = bw ? null : e1rm(pr.weight, pr.reps);

  let lo = Math.min(...ys, prY ?? Infinity), hi = Math.max(...ys, prY ?? -Infinity);
  const pad = Math.max((hi - lo) * 0.15, bw ? 1 : 2);
  lo -= pad; hi += pad * 1.6;
  const ticks = niceTicks(lo, hi);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1));

  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const iw = W - PAD.left - PAD.right, ih = H - PAD.top - PAD.bottom;
  const X = (t) => (x0 === x1 ? PAD.left + iw / 2 : PAD.left + ((t - x0) / (x1 - x0)) * iw);
  const Y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
    'aria-label': `График: ${points.length} тренировок` });

  // сетка и подписи оси Y
  for (const t of ticks) {
    if (t < lo || t > hi) continue;
    svg.append(s('line', { x1: PAD.left, x2: W - PAD.right, y1: Y(t), y2: Y(t), class: 'grid' }));
    svg.append(s('text', { x: PAD.left - 8, y: Y(t) + 4, class: 'axis', 'text-anchor': 'end' }, String(t)));
  }
  // подписи дат: первая, последняя и середина
  const dateIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  for (const i of dateIdx) {
    if (dateIdx.length === 3 && i !== 0 && i !== points.length - 1 &&
        (Math.abs(X(xs[i]) - X(xs[0])) < 50 || Math.abs(X(xs.at(-1)) - X(xs[i])) < 50)) continue;
    svg.append(s('text', { x: X(xs[i]), y: H - 8, class: 'axis',
      'text-anchor': points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle' },
      fmtDate(points[i].date)));
  }
  // линия рекорда
  if (prY != null) {
    svg.append(s('line', { x1: PAD.left, x2: W - PAD.right, y1: Y(prY), y2: Y(prY), class: 'pr-line' }));
  }
  // линия по тренировкам
  if (points.length > 1) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(' ');
    svg.append(s('path', { d, class: 'series' }));
  }
  // подписи реальных подходов: первая, последняя, лучшая (для своего веса — где сменился доп. вес)
  const labelIdx = new Set([0, points.length - 1]);
  if (bw) points.forEach((p, i) => { if (i && p.best.weight !== points[i - 1].best.weight) labelIdx.add(i); });
  else labelIdx.add(ys.indexOf(Math.max(...ys)));

  const readout = h('p', { class: 'chart-readout', 'aria-live': 'polite' });
  const marks = [];
  const select = (i) => {
    marks.forEach((m, j) => m.classList.toggle('active', j === i));
    const p = points[i];
    readout.replaceChildren(h('b', {}, fmtDate(p.date)), ` · лучший подход ${fmtSet(p.best.weight, p.best.reps, bw)}`,
      ` · ${p.sets} ${p.sets === 1 ? 'подход' : p.sets < 5 ? 'подхода' : 'подходов'}`);
  };

  points.forEach((p, i) => {
    const cx = X(xs[i]), cy = Y(ys[i]);
    const dot = s('circle', { cx, cy, r: 5, class: 'dot' });
    marks.push(dot);
    svg.append(dot);
    if (labelIdx.has(i)) {
      const anchor = points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle';
      svg.append(s('text', { x: cx, y: cy - 11, class: 'point-label', 'text-anchor': anchor },
        fmtSet(p.best.weight, p.best.reps, bw)));
    }
    // зона нажатия больше самой точки
    const hit = s('circle', { cx, cy, r: 16, class: 'hit', tabindex: 0, role: 'button',
      'aria-label': `${fmtDate(p.date)}: ${fmtSet(p.best.weight, p.best.reps, bw)}` });
    hit.addEventListener('click', () => select(i));
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    svg.append(hit);
  });
  select(points.length - 1);

  const legend = h('p', { class: 'chart-legend' },
    bw ? 'Повторы лучшего подхода. Подписи — доп. вес × повторы.'
      : `Уровень силы (расчётный максимум, кг). Пунктир — рекорд ${fmtSet(pr.weight, pr.reps, false)}.`);
  return h('figure', { class: 'chart-box' }, legend, svg, readout);
}
