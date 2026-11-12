// Логика раздела «Тренировка» (п. 5 ТЗ). Работает с Data, без DOM.

import { InputError, isoDate, nowIso } from './util.js';
import { listPlanExercises, listWorkouts } from './plans.js';
import { sessionRecords } from './records.js';

// ---------------------------------------------------------------- очередь

function hasSets(data, sessionId) {
  return data.all('sets').some(s => s.sessionId === sessionId);
}

/** Следующая по очереди тренировка активного плана. */
export function nextWorkout(data, plan) {
  const workouts = listWorkouts(data, plan.id);
  if (!workouts.length) return null;
  const planWorkoutIds = new Set(data.where('workouts', w => w.planId === plan.id).map(w => w.id));
  const last = data.where('sessions', s => s.finishedAt && planWorkoutIds.has(s.workoutId))
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    .at(-1);
  const ids = workouts.map(w => w.id);
  if (!last || !ids.includes(last.workoutId)) return workouts[0];  // первая или последняя удалена
  return workouts[(ids.indexOf(last.workoutId) + 1) % workouts.length];
}

// ---------------------------------------------------------------- сессии

export function openSession(data) {
  return data.where('sessions', s => !s.finishedAt).sort((a, b) => b.id - a.id)[0] ?? null;
}

export function startSession(data, workoutId, today = isoDate()) {
  if (openSession(data)) throw new InputError('Уже идёт другая тренировка.');
  const first = listPlanExercises(data, workoutId)[0];
  return data.insert('sessions', {
    workoutId, date: today, startedAt: nowIso(), finishedAt: null, autoFinished: false,
    currentExerciseId: first ? first.exerciseId : null,
  });
}

export function setCurrent(data, sessionId, exerciseId) {
  data.update('sessions', sessionId, { currentExerciseId: exerciseId });
}

export function setsOf(data, sessionId, exerciseId) {
  return data.where('sets', s => s.sessionId === sessionId && (exerciseId == null || s.exerciseId === exerciseId))
    .sort((a, b) => a.id - b.id);
}

/**
 * Упражнения сессии по порядку: сначала по плану, потом добавленные не по плану.
 * Каждый элемент: { exerciseId, name, isBodyweight, repMin, repMax, planned, sets }
 */
export function sessionExercises(data, session) {
  const items = new Map();
  for (const pe of listPlanExercises(data, session.workoutId)) {
    items.set(pe.exerciseId, { exerciseId: pe.exerciseId, name: pe.name, isBodyweight: pe.isBodyweight,
      repMin: pe.repMin, repMax: pe.repMax, planned: true, sets: [] });
  }
  const add = (exId) => {
    if (items.has(exId)) return;
    const e = data.get('exercises', exId);
    if (e) items.set(exId, { exerciseId: exId, name: e.name, isBodyweight: e.isBodyweight,
      repMin: null, repMax: null, planned: false, sets: [] });
  };
  for (const s of setsOf(data, session.id)) {
    add(s.exerciseId);
    items.get(s.exerciseId)?.sets.push(s);
  }
  if (session.currentExerciseId != null) add(session.currentExerciseId);  // только что добавлено не по плану
  return [...items.values()];
}

export function currentIndex(session, items) {
  const i = items.findIndex(e => e.exerciseId === session.currentExerciseId);
  return i < 0 ? 0 : i;
}

export function addSet(data, sessionId, exerciseId, weight, reps) {
  return data.insert('sets', { sessionId, exerciseId, weight, reps, createdAt: nowIso() });
}

export function deleteLastSet(data, sessionId, exerciseId) {
  const last = setsOf(data, sessionId, exerciseId).at(-1);
  if (last) data.remove('sets', last.id);
  return last ?? null;
}

// ---------------------------------------------------------------- прошлый раз и подсказка

/** Подходы упражнения на прошлой сессии этой же тренировки (или любой, если такой нет). */
export function lastTime(data, exerciseId, workoutId, excludeSessionId) {
  const done = data.where('sessions', s => s.finishedAt && s.id !== excludeSessionId)
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  for (const same of [true, false]) {
    for (const s of done) {
      if (same && s.workoutId !== workoutId) continue;
      const sets = setsOf(data, s.id, exerciseId);
      if (sets.length) {
        const w = data.get('workouts', s.workoutId);
        return { date: s.date, workoutName: w?.name ?? '', sameWorkout: s.workoutId === workoutId, sets };
      }
    }
  }
  return null;
}

/** Во всех подходах достигнута верхняя граница при одном и том же весе. */
export function shouldIncrease(sets, repMax) {
  if (!sets?.length || repMax == null) return false;
  return new Set(sets.map(s => s.weight)).size === 1 && sets.every(s => s.reps >= repMax);
}

/** Вес, который подставить в поле: последний сегодня, иначе первый подход прошлого раза. */
export function suggestedWeight(todaySets, last) {
  if (todaySets.length) return todaySets.at(-1).weight;
  if (last?.sets.length) return last.sets[0].weight;
  return null;
}

// ---------------------------------------------------------------- завершение

/** Завершает сессию. Пустая (без подходов) удаляется — тогда возвращает null. */
export function finishSession(data, sessionId, { auto = false } = {}) {
  const session = data.get('sessions', sessionId);
  if (!session || session.finishedAt) return null;
  const done = sessionExercises(data, session).filter(e => e.sets.length);
  if (!done.length) {
    data.remove('sessions', sessionId);
    return null;
  }
  const lastSet = setsOf(data, sessionId).map(s => s.createdAt).sort().at(-1);
  data.update('sessions', sessionId, {
    finishedAt: auto ? (lastSet || session.startedAt) : nowIso(),
    autoFinished: auto, currentExerciseId: null,
  });
  return summary(data, sessionId);
}

export function summary(data, sessionId) {
  const session = data.get('sessions', sessionId);
  const workout = data.get('workouts', session.workoutId);
  const exercises = sessionExercises(data, session).filter(e => e.sets.length);
  const records = exercises
    .map(e => ({ name: e.name, items: sessionRecords(data, session, e.exerciseId, e.isBodyweight) }))
    .filter(r => r.items.length);
  return {
    sessionId, date: session.date, workoutName: workout?.name ?? '', auto: session.autoFinished,
    exercises, records, totalSets: exercises.reduce((n, e) => n + e.sets.length, 0),
  };
}

/** Закрывает незавершённые сессии прошлых дней (п. 5.4 ТЗ). */
export function autofinishStale(data, today = isoDate()) {
  const out = [];
  for (const s of data.where('sessions', s => !s.finishedAt && s.date < today)) {
    const sm = finishSession(data, s.id, { auto: true });
    if (sm) out.push(sm);
  }
  return out;
}
