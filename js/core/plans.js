// Логика раздела «План» (п. 4 ТЗ). Работает с Data, без DOM.

import { InputError, cleanName, daysBetween, isoDate, nowIso, sameName, sortByName } from './util.js';

// ---------------------------------------------------------------- план

export function activePlan(data) {
  return data.where('plans', p => p.isActive).sort((a, b) => b.id - a.id)[0] ?? null;
}

export function createPlan(data, { name, perWeek, weeks }, today = isoDate()) {
  for (const p of data.where('plans', p => p.isActive)) {
    data.update('plans', p.id, { isActive: false, archivedAt: nowIso() });
  }
  return data.insert('plans', {
    name: cleanName(name), workoutsPerWeek: perWeek, durationWeeks: weeks,
    startDate: today, isActive: true, archivedAt: null,
  });
}

export function updatePlan(data, planId, patch) {
  return data.update('plans', planId, patch);
}

function planSessions(data, planId) {
  const workoutIds = new Set(data.where('workouts', w => w.planId === planId).map(w => w.id));
  const withSets = new Set(data.all('sets').map(s => s.sessionId));
  return data.where('sessions', s => workoutIds.has(s.workoutId) && withSets.has(s.id));
}

/** Дата начала плана = дата первой тренировки по нему с подходами (п. 4.2 ТЗ); null — ещё не начат. */
export function planStartDate(data, planId) {
  return planSessions(data, planId).map(s => s.date).sort()[0] ?? null;
}

export function planStats(data, plan, today = isoDate()) {
  const totalDays = plan.durationWeeks * 7;
  const sessions = planSessions(data, plan.id).length;
  const start = planStartDate(data, plan.id);
  if (!start) return { started: false, dayNo: 0, totalDays, sessions, overdue: false, startDate: null };
  const dayNo = daysBetween(start, today) + 1;
  return { started: true, dayNo, totalDays, sessions, overdue: dayNo > totalDays, startDate: start };
}

/**
 * Удаление плана (п. 4.4.1 ТЗ). Без истории — удаляется полностью;
 * с историей — скрывается, а тренировки и подходы остаются для рекордов и прогресса.
 */
export function deletePlan(data, planId) {
  const hadHistory = planSessions(data, planId).length > 0;
  const workouts = data.where('workouts', w => w.planId === planId);
  if (hadHistory) {
    data.update('plans', planId, { isActive: false, isDeleted: true, archivedAt: nowIso() });
  } else {
    const ids = new Set(workouts.map(w => w.id));
    for (const pe of data.where('planExercises', pe => ids.has(pe.workoutId))) data.remove('planExercises', pe.id);
    for (const s of data.where('sessions', s => ids.has(s.workoutId))) data.remove('sessions', s.id);  // пустые
    for (const w of workouts) data.remove('workouts', w.id);
    data.remove('plans', planId);
  }
  return { hadHistory };
}

// ---------------------------------------------------------------- тренировки плана

export function listWorkouts(data, planId) {
  return data.where('workouts', w => w.planId === planId && !w.isDeleted)
    .sort((a, b) => a.position - b.position);
}

export function addWorkout(data, planId, name) {
  const pos = listWorkouts(data, planId).length + 1;
  return data.insert('workouts', { planId, name: cleanName(name), position: pos, isDeleted: false });
}

export function renameWorkout(data, id, name) {
  data.update('workouts', id, { name: cleanName(name) });
}

export function deleteWorkout(data, id) {
  // Мягкое удаление: прошлые тренировки сохраняют ссылку и название
  const w = data.get('workouts', id);
  if (!w) return;
  data.update('workouts', id, { isDeleted: true });
  renumber(data, 'workouts', listWorkouts(data, w.planId));
}

export function moveWorkout(data, id, dir) {
  const w = data.get('workouts', id);
  if (!w) return false;
  return move(data, 'workouts', listWorkouts(data, w.planId), id, dir);
}

// ---------------------------------------------------------------- упражнения тренировки

export function listPlanExercises(data, workoutId) {
  return data.where('planExercises', pe => pe.workoutId === workoutId)
    .sort((a, b) => a.position - b.position)
    .map(pe => {
      const ex = data.get('exercises', pe.exerciseId);
      return { ...pe, name: ex.name, isBodyweight: ex.isBodyweight };
    });
}

export function addPlanExercise(data, workoutId, exerciseId, repMin, repMax) {
  if (listPlanExercises(data, workoutId).some(pe => pe.exerciseId === exerciseId)) {
    throw new InputError('Это упражнение уже есть в тренировке.');
  }
  const pos = listPlanExercises(data, workoutId).length + 1;
  return data.insert('planExercises', { workoutId, exerciseId, position: pos, repMin, repMax });
}

export function setRange(data, peId, repMin, repMax) {
  data.update('planExercises', peId, { repMin, repMax });
}

export function replacePlanExercise(data, peId, exerciseId) {
  const pe = data.get('planExercises', peId);
  if (!pe) return;
  if (pe.exerciseId !== exerciseId &&
      listPlanExercises(data, pe.workoutId).some(x => x.exerciseId === exerciseId)) {
    throw new InputError('Это упражнение уже есть в тренировке.');
  }
  data.update('planExercises', peId, { exerciseId });
}

export function removePlanExercise(data, peId) {
  const pe = data.get('planExercises', peId);
  if (!pe) return;
  data.remove('planExercises', peId);
  renumber(data, 'planExercises', listPlanExercises(data, pe.workoutId));
}

export function movePlanExercise(data, peId, dir) {
  const pe = data.get('planExercises', peId);
  if (!pe) return false;
  return move(data, 'planExercises', listPlanExercises(data, pe.workoutId), peId, dir);
}

// ---------------------------------------------------------------- справочник упражнений

export function listExercises(data) {
  return sortByName(data.all('exercises'));
}

export function findExercise(data, name) {
  return data.all('exercises').find(e => sameName(e.name, name.trim().replace(/\s+/g, ' '))) ?? null;
}

/** Где используется упражнение — для предупреждения перед удалением (п. 4.6 ТЗ). */
export function exerciseUsage(data, exerciseId) {
  const liveWorkouts = new Map();
  for (const pe of data.where('planExercises', pe => pe.exerciseId === exerciseId)) {
    const w = data.get('workouts', pe.workoutId);
    const plan = w && data.get('plans', w.planId);
    if (w && !w.isDeleted && plan?.isActive) liveWorkouts.set(w.id, w.name);
  }
  const sets = data.where('sets', s => s.exerciseId === exerciseId);
  return {
    workouts: [...liveWorkouts.values()],
    sets: sets.length,
    sessions: new Set(sets.map(s => s.sessionId)).size,
  };
}

export function renameExercise(data, exerciseId, name) {
  name = cleanName(name, 'Название упражнения');
  const other = findExercise(data, name);
  if (other && other.id !== exerciseId) throw new InputError(`Упражнение «${other.name}» уже есть.`);
  data.update('exercises', exerciseId, { name });
}

/** Удаляет упражнение вместе с местами в планах и его подходами. */
export function deleteExercise(data, exerciseId) {
  const touched = new Set();
  for (const pe of data.where('planExercises', pe => pe.exerciseId === exerciseId)) {
    data.remove('planExercises', pe.id);
    touched.add(pe.workoutId);
  }
  for (const wid of touched) renumber(data, 'planExercises', listPlanExercises(data, wid));
  const sessionIds = new Set();
  for (const s of data.where('sets', s => s.exerciseId === exerciseId)) {
    data.remove('sets', s.id);
    sessionIds.add(s.sessionId);
  }
  // Завершённые тренировки, где больше не осталось подходов, тоже убираем
  const left = new Set(data.all('sets').map(s => s.sessionId));
  for (const sid of sessionIds) {
    const ses = data.get('sessions', sid);
    if (ses?.finishedAt && !left.has(sid)) data.remove('sessions', sid);
  }
  for (const ses of data.where('sessions', s => !s.finishedAt && s.currentExerciseId === exerciseId)) {
    data.update('sessions', ses.id, { currentExerciseId: null });
  }
  data.remove('exercises', exerciseId);
}

export function createExercise(data, name, isBodyweight) {
  name = cleanName(name, 'Название упражнения');
  const existing = findExercise(data, name);
  if (existing) throw new InputError(`Упражнение «${existing.name}» уже есть — выбери его из списка.`);
  return data.insert('exercises', { name, isBodyweight: !!isBodyweight, createdAt: nowIso() });
}

// ---------------------------------------------------------------- порядок

function renumber(data, store, rows) {
  rows.forEach((r, i) => { if (r.position !== i + 1) data.update(store, r.id, { position: i + 1 }); });
}

function move(data, store, rows, id, dir) {
  const ids = rows.map(r => r.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  ids.forEach((rid, k) => data.update(store, rid, { position: k + 1 }));
  return true;
}
