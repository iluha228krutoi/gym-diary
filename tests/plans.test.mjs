import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Data, MemoryPersist } from '../js/data.js';
import * as P from '../js/core/plans.js';
import * as B from '../js/backup.js';
import { InputError, checkRange, cleanName, parseWeight, parseReps, plural } from '../js/core/util.js';

async function fresh() {
  const d = new Data(new MemoryPersist());
  await d.load();
  return d;
}

test('создание плана и архив старого', async () => {
  const d = await fresh();
  const p1 = P.createPlan(d, { name: ' Верх/Низ ', perWeek: 3, weeks: 8 }, '2026-11-01');
  assert.equal(p1.name, 'Верх/Низ');
  const p2 = P.createPlan(d, { name: 'Новый', perWeek: 4, weeks: 6 }, '2026-11-10');
  assert.equal(P.activePlan(d).id, p2.id);
  assert.equal(d.get('plans', p1.id).isActive, false);
  const st = P.planStats(d, p2, '2026-12-30');
  assert.equal(st.started, false, 'без тренировок план не начат');
});

test('тренировки: порядок, перемещение, мягкое удаление', async () => {
  const d = await fresh();
  const p = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 });
  const a = P.addWorkout(d, p.id, 'А'), b = P.addWorkout(d, p.id, 'Б'), c = P.addWorkout(d, p.id, 'В');
  P.moveWorkout(d, c.id, -1);
  assert.deepEqual(P.listWorkouts(d, p.id).map(w => w.name), ['А', 'В', 'Б']);
  assert.equal(P.moveWorkout(d, a.id, -1), false);
  P.deleteWorkout(d, a.id);
  assert.deepEqual(P.listWorkouts(d, p.id).map(w => [w.position, w.name]), [[1, 'В'], [2, 'Б']]);
  assert.ok(d.get('workouts', a.id), 'запись осталась для истории');
});

test('упражнения: дубликаты, диапазон, замена, удаление', async () => {
  const d = await fresh();
  const p = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 });
  const w = P.addWorkout(d, p.id, 'А');
  const bench = P.createExercise(d, 'Жим лёжа', false);
  const dips = P.createExercise(d, 'Брусья', true);
  assert.throws(() => P.createExercise(d, 'жим  ЛЁЖА', false), /уже есть/);
  assert.equal(P.findExercise(d, 'БРУСЬЯ').id, dips.id);
  const pe1 = P.addPlanExercise(d, w.id, bench.id, 6, 10);
  const pe2 = P.addPlanExercise(d, w.id, dips.id, 8, 15);
  assert.throws(() => P.addPlanExercise(d, w.id, bench.id, 6, 10), InputError);
  P.movePlanExercise(d, pe2.id, -1);
  assert.deepEqual(P.listPlanExercises(d, w.id).map(x => x.name), ['Брусья', 'Жим лёжа']);
  assert.throws(() => P.replacePlanExercise(d, pe2.id, bench.id), /уже есть/);
  const curl = P.createExercise(d, 'Бицепс', false);
  P.replacePlanExercise(d, pe2.id, curl.id);
  P.setRange(d, pe1.id, 5, 8);
  P.removePlanExercise(d, pe2.id);
  assert.deepEqual(P.listPlanExercises(d, w.id).map(x => [x.position, x.name, x.repMin, x.repMax]),
    [[1, 'Жим лёжа', 5, 8]]);
});

test('ввод и форматирование', () => {
  assert.equal(cleanName('  Жим   стоя '), 'Жим стоя');
  assert.throws(() => cleanName(''), InputError);
  assert.deepEqual(checkRange('8', '16'), [8, 16]);
  assert.throws(() => checkRange(16, 8), /больше/);
  assert.equal(parseWeight('22,5'), 22.5);
  assert.throws(() => parseWeight('abc'), InputError);
  assert.throws(() => parseReps('0'), InputError);
  assert.equal(plural(3, 'неделя', 'недели', 'недель'), 'недели');
  assert.equal(plural(11, 'неделя', 'недели', 'недель'), 'недель');
});

test('резервная копия: экспорт → изменения → восстановление', async () => {
  const d = await fresh();
  const p = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 });
  P.addWorkout(d, p.id, 'А');
  P.createExercise(d, 'Жим', false);
  const copy = JSON.parse(JSON.stringify(B.makeBackup(d)));
  const info = B.inspectBackup(copy);
  assert.equal(info.exercises, 1);
  P.createExercise(d, 'Тяга', false);
  P.createPlan(d, { name: 'Другой', perWeek: 2, weeks: 4 });
  await B.restoreBackup(d, copy);
  assert.equal(d.all('exercises').length, 1);
  assert.equal(P.activePlan(d).name, 'P');
  assert.ok(d.meta.lastBackupAt);
  assert.throws(() => B.inspectBackup({ format: 'x' }), /не резервная копия/);
  assert.throws(() => B.inspectBackup({ ...copy, schemaVersion: 99 }), /новой версией/);
  assert.throws(() => B.inspectBackup({ ...copy, tables: { ...copy.tables, sets: 'oops' } }), /повреждён/);
});

test('будущие хранилища попадают в копию автоматически', async () => {
  const persist = new MemoryPersist();
  persist.tables.foods = new Map([[1, { id: 1, name: 'Гречка' }]]);
  const d = new Data(persist);
  await d.load();
  assert.equal(B.makeBackup(d).tables.foods.length, 1);
});

test('отсчёт плана — с первой тренировки', async () => {
  const W = await import('../js/core/workouts.js');
  const d = await fresh();
  const p = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 2 }, '2026-11-01');
  const w = P.addWorkout(d, p.id, 'А');
  const ex = P.createExercise(d, 'Жим', false);
  assert.equal(P.planStats(d, p, '2026-11-10').started, false);
  const empty = W.startSession(d, w.id, '2026-11-05');       // открыл, но не записал — не старт
  assert.equal(P.planStats(d, p, '2026-11-05').started, false);
  W.addSet(d, empty.id, ex.id, 50, 10);
  const st = P.planStats(d, p, '2026-11-07');
  assert.deepEqual([st.started, st.dayNo, st.startDate, st.sessions], [true, 3, '2026-11-05', 1]);
  assert.equal(P.planStats(d, p, '2026-11-19').overdue, true);
});

test('удаление плана: без истории — полностью, с историей — история остаётся', async () => {
  const W = await import('../js/core/workouts.js');
  const d = await fresh();
  const p1 = P.createPlan(d, { name: 'Тест', perWeek: 3, weeks: 2 });
  const w1 = P.addWorkout(d, p1.id, 'А');
  const ex = P.createExercise(d, 'Жим', false);
  P.addPlanExercise(d, w1.id, ex.id, 6, 10);
  assert.deepEqual(P.deletePlan(d, p1.id), { hadHistory: false });
  assert.equal(d.all('plans').length + d.all('workouts').length + d.all('planExercises').length, 0);
  assert.equal(d.all('exercises').length, 1, 'упражнения остаются');

  const p2 = P.createPlan(d, { name: 'Рабочий', perWeek: 3, weeks: 8 });
  const w2 = P.addWorkout(d, p2.id, 'А');
  const s = W.startSession(d, w2.id); W.addSet(d, s.id, ex.id, 80, 8); W.finishSession(d, s.id);
  assert.deepEqual(P.deletePlan(d, p2.id), { hadHistory: true });
  assert.equal(P.activePlan(d), null);
  assert.equal(d.all('sets').length, 1);
});

test('справочник: использование, переименование, удаление упражнения', async () => {
  const W = await import('../js/core/workouts.js');
  const d = await fresh();
  const p = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 });
  const a = P.addWorkout(d, p.id, 'А'), b = P.addWorkout(d, p.id, 'Б');
  const bench = P.createExercise(d, 'Жим', false), row = P.createExercise(d, 'Тяга', false);
  P.addPlanExercise(d, a.id, bench.id, 6, 10); P.addPlanExercise(d, a.id, row.id, 8, 12);
  P.addPlanExercise(d, b.id, bench.id, 8, 12);
  const s1 = W.startSession(d, a.id, '2026-11-01'); W.addSet(d, s1.id, bench.id, 80, 8); W.finishSession(d, s1.id);
  const s2 = W.startSession(d, a.id, '2026-11-03'); W.addSet(d, s2.id, bench.id, 80, 8);
  W.addSet(d, s2.id, row.id, 60, 10); W.finishSession(d, s2.id);
  assert.deepEqual(P.exerciseUsage(d, bench.id), { workouts: ['А', 'Б'], sets: 2, sessions: 2 });
  assert.throws(() => P.renameExercise(d, bench.id, 'тяга'), /уже есть/);
  P.renameExercise(d, bench.id, 'Жим лёжа');
  assert.equal(P.listPlanExercises(d, a.id)[0].name, 'Жим лёжа');
  P.deleteExercise(d, bench.id);
  assert.deepEqual(P.listPlanExercises(d, a.id).map(x => [x.position, x.name]), [[1, 'Тяга']]);
  assert.equal(d.get('sessions', s1.id), null, 'тренировка без подходов удалена');
  assert.ok(d.get('sessions', s2.id), 'тренировка с другими подходами осталась');
});
