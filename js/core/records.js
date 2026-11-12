// Рекорды (п. 6 ТЗ). Чистые вычисления по истории подходов.
//
// Обычные упражнения:
//   • лучший подход — по расчётному одноповторному максимуму (формула Эпли);
//   • таблица «повторы → лучший вес»: лучший вес, поднятый МИНИМУМ на N повторов.
// С собственным весом:
//   • лучший подход — больший доп. вес, при равном — больше повторов;
//   • таблица «доп. вес → максимум повторов» с доп. весом не меньше указанного.
// Строки таблиц — только значения, которые реально встречались.

import { fmtSet, fmtWeight, plural } from './util.js';

export function e1rm(weight, reps) {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

function key(s, bw) {
  return bw ? [s.weight, s.reps] : [e1rm(s.weight, s.reps), s.weight];
}

function greater(a, b) {
  return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];
}

/** Лучший подход; при равенстве — самый ранний (когда рекорд поставлен). sets — в хронологическом порядке. */
export function bestSet(sets, bw) {
  let best = null;
  for (const s of sets) if (!best || greater(key(s, bw), key(best, bw))) best = s;
  return best;
}

function rowValue(sets, k, bw) {
  let v = null;
  for (const s of sets) {
    if (bw ? s.weight >= k : s.reps >= k) {
      const val = bw ? s.reps : s.weight;
      if (v === null || val > v) v = val;
    }
  }
  return v;
}

export function repTable(sets, bw) {
  const keys = [...new Set(sets.map(s => (bw ? s.weight : s.reps)))].sort((a, b) => a - b);
  return keys.map(k => {
    let best = null;
    for (const s of sets) {
      if (bw ? s.weight >= k : s.reps >= k) {
        const val = bw ? s.reps : s.weight;
        if (!best || val > (bw ? best.reps : best.weight)) best = s;
      }
    }
    return { key: k, value: bw ? best.reps : best.weight, date: best.date };
  });
}

/**
 * Какие рекорды побиты подходами current по сравнению с историей prior.
 * Если упражнение раньше не делалось (prior пуст) — рекордов нет: сравнивать не с чем.
 */
export function newRecords(prior, current, bw) {
  if (!prior.length || !current.length) return [];
  const out = [];
  const pb = bestSet(prior, bw), cb = bestSet(current, bw);
  if (greater(key(cb, bw), key(pb, bw))) {
    out.push(`лучший подход ${fmtSet(cb.weight, cb.reps, bw)} (был ${fmtSet(pb.weight, pb.reps, bw)})`);
  }
  const keys = [...new Set(prior.map(s => (bw ? s.weight : s.reps)))].sort((a, b) => a - b);
  let improved = keys.filter(k => {
    const old = rowValue(prior, k, bw), now = rowValue(current, k, bw);
    return old !== null && now !== null && now > old;
  });
  // не дублируем: если улучшилась только строка самого лучшего подхода — хватит первого сообщения
  if (out.length && improved.length === 1 && improved[0] === (bw ? cb.weight : cb.reps)) improved = [];
  if (improved.length) {
    if (bw) {
      out.push(`рекорд повторов: ${improved.map(k => (k > 0 ? `+${fmtWeight(k)}` : 'свой вес')).join(', ')}`);
    } else {
      const last = improved.at(-1);
      out.push(`${improved.length > 1 ? 'рекорды' : 'рекорд'} веса на ${improved.join(', ')} ` +
        plural(last, 'повторение', 'повторения', 'повторений'));
    }
  }
  return out;
}

// ---------------------------------------------------------------- выборка из данных

/** Все подходы упражнения в хронологическом порядке, с датой тренировки. */
export function exerciseHistory(data, exerciseId) {
  const sessions = new Map(data.all('sessions').map(s => [s.id, s]));
  return data.where('sets', s => s.exerciseId === exerciseId && sessions.has(s.sessionId))
    .map(s => ({ ...s, date: sessions.get(s.sessionId).date }))
    .sort((a, b) => (a.date === b.date ? (a.sessionId === b.sessionId ? a.id - b.id : a.sessionId - b.sessionId)
      : a.date < b.date ? -1 : 1));
}

function before(a, b) {
  return a.date === b.date ? a.sessionId < b.sessionId : a.date < b.date;
}

/** Рекорды, которые побьёт вводимый подход (вызывать ДО записи). */
export function liveRecords(data, session, exerciseId, bw, weight, reps) {
  const history = exerciseHistory(data, exerciseId);
  if (!history.some(s => s.sessionId !== session.id)) return [];   // раньше не делал
  return newRecords(history, [{ weight, reps, date: session.date, sessionId: session.id }], bw);
}

/** Рекорды, поставленные за тренировку по одному упражнению (для сводки). */
export function sessionRecords(data, session, exerciseId, bw) {
  const history = exerciseHistory(data, exerciseId);
  const me = { date: session.date, sessionId: session.id };
  const prior = history.filter(s => s.sessionId !== session.id && before(s, me));
  const current = history.filter(s => s.sessionId === session.id);
  return newRecords(prior, current, bw);
}

export function exercisesWithHistory(data) {
  const ids = new Set(data.all('sets').map(s => s.exerciseId));
  return data.where('exercises', e => ids.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
}
