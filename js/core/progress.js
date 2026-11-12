// Анализ прогресса за период (п. 7 ТЗ). Без DOM.

import { activePlan, planStartDate } from './plans.js';
import { bestSet, e1rm, exerciseHistory, exercisesWithHistory } from './records.js';
import { addDays, daysBetween, isoDate } from './util.js';

// Периоды задаются списком — чтобы добавить новый (например, 6 месяцев), достаточно строки
export const PERIODS = [
  { months: 1, days: 30, label: '1 месяц' },
  { months: 2, days: 60, label: '2 месяца' },
];
export const BREAK_DAYS = 7;

export function period(months) {
  return PERIODS.find(p => p.months === months) ?? PERIODS[0];
}

export function periodStart(months, today = isoDate()) {
  return addDays(today, -(period(months).days - 1));
}

/** Показатель для графика: расчётный максимум или (для своего веса) повторы лучшего подхода. */
export function strength(best, bw) {
  return bw ? best.reps : e1rm(best.weight, best.reps);
}

export function exerciseProgress(data, exercise, start, end) {
  const bw = exercise.isBodyweight;
  const history = exerciseHistory(data, exercise.id);
  if (!history.length) return null;
  const bySession = new Map();
  for (const s of history) {
    if (s.date < start || s.date > end) continue;
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }
  if (!bySession.size) return null;
  const points = [...bySession.values()].map(sets => ({
    date: sets[0].date,
    best: bestSet(sets, bw),
    volume: bw ? sets.reduce((n, s) => n + s.reps, 0) : sets.reduce((n, s) => n + s.weight * s.reps, 0),
    sets: sets.length,
  }));
  const pr = bestSet(history, bw);
  const first = points[0], last = points.at(-1);

  let changePct = null, volumePct = null;
  if (points.length > 1) {
    if (!bw) changePct = (strength(last.best, false) / strength(first.best, false) - 1) * 100;
    else if (first.best.weight === last.best.weight) changePct = (last.best.reps / first.best.reps - 1) * 100;
    const comparableVolume = !bw || first.best.weight === last.best.weight;
    if (comparableVolume && first.volume > 0) volumePct = (last.volume / first.volume - 1) * 100;
  }
  let ofPrPct = null;
  if (!bw) ofPrPct = strength(last.best, false) / strength(pr, false) * 100;
  else if (last.best.weight === pr.weight) ofPrPct = last.best.reps / pr.reps * 100;

  return { exercise, bw, points, first, last, pr, changePct, volumePct, ofPrPct };
}

export function overview(data, months, today = isoDate()) {
  const start = periodStart(months, today);
  const withSets = new Set(data.all('sets').map(s => s.sessionId));
  const sessions = data.where('sessions', s => withSets.has(s.id) && s.date >= start && s.date <= today);
  const dates = [...new Set(sessions.map(s => s.date))].sort();

  // Ожидаемое число тренировок — с начала периода или с первой тренировки по плану, что позже
  let expected = null;
  const plan = activePlan(data);
  const planStart = plan && planStartDate(data, plan.id);
  if (plan && planStart) {
    const from = planStart > start ? planStart : start;
    expected = Math.max(1, Math.round(plan.workoutsPerWeek * (daysBetween(from, today) + 1) / 7));
  }

  const breaks = [];
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i - 1], dates[i]) - 1;
    if (gap > BREAK_DAYS) breaks.push({ from: addDays(dates[i - 1], 1), to: addDays(dates[i], -1), days: gap });
  }
  if (dates.length) {
    const gap = daysBetween(dates.at(-1), today);
    if (gap > BREAK_DAYS) breaks.push({ from: addDays(dates.at(-1), 1), to: today, days: gap, ongoing: true });
  }

  const exercises = exercisesWithHistory(data)
    .map(ex => exerciseProgress(data, ex, start, today))
    .filter(Boolean);
  return { months, start, end: today, sessions: sessions.length, expected, breaks, exercises };
}
