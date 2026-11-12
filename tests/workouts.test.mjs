import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Data, MemoryPersist } from '../js/data.js';
import * as P from '../js/core/plans.js';
import * as W from '../js/core/workouts.js';

async function setup() {
  const d = new Data(new MemoryPersist());
  await d.load();
  const plan = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 }, '2026-11-01');
  const a = P.addWorkout(d, plan.id, 'А');
  const b = P.addWorkout(d, plan.id, 'Б');
  const bench = P.createExercise(d, 'Жим', false);
  const dips = P.createExercise(d, 'Брусья', true);
  const curl = P.createExercise(d, 'Бицепс', false);
  P.addPlanExercise(d, a.id, bench.id, 6, 10);
  P.addPlanExercise(d, a.id, dips.id, 8, 15);
  P.addPlanExercise(d, b.id, curl.id, 8, 16);
  return { d, plan, a, b, bench, dips, curl };
}

test('очередь тренировок и удаление последней выполненной', async () => {
  const { d, plan, a, b, bench } = await setup();
  assert.equal(W.nextWorkout(d, plan).name, 'А');
  const s = W.startSession(d, a.id, '2026-11-05');
  W.addSet(d, s.id, bench.id, 80, 8);
  W.finishSession(d, s.id);
  assert.equal(W.nextWorkout(d, plan).name, 'Б');
  P.deleteWorkout(d, a.id);
  assert.equal(W.nextWorkout(d, plan).name, 'Б', 'после удаления последней — первая');
  assert.equal(b.name, 'Б');
});

test('сессия: подходы, упражнение не по плану, удаление подхода', async () => {
  const { d, a, bench, dips, curl } = await setup();
  const s = W.startSession(d, a.id, '2026-11-05');
  assert.equal(s.currentExerciseId, bench.id);
  assert.throws(() => W.startSession(d, a.id), /Уже идёт/);
  W.addSet(d, s.id, bench.id, 80, 8);
  W.addSet(d, s.id, bench.id, 80, 7);
  W.setCurrent(d, s.id, curl.id);                       // не по плану, подходов ещё нет
  let items = W.sessionExercises(d, d.get('sessions', s.id));
  assert.deepEqual(items.map(e => [e.name, e.planned, e.sets.length]),
    [['Жим', true, 2], ['Брусья', true, 0], ['Бицепс', false, 0]]);
  assert.equal(W.currentIndex(d.get('sessions', s.id), items), 2);
  assert.equal(W.deleteLastSet(d, s.id, bench.id).reps, 7);
  assert.equal(W.deleteLastSet(d, s.id, dips.id), null);
  items = W.sessionExercises(d, d.get('sessions', s.id));
  assert.equal(items[0].sets.length, 1);
});

test('прошлый раз, подсказка и подставляемый вес', async () => {
  const { d, a, b, bench, curl } = await setup();
  const s1 = W.startSession(d, a.id, '2026-11-01');
  W.addSet(d, s1.id, bench.id, 80, 10); W.addSet(d, s1.id, bench.id, 80, 10);
  W.finishSession(d, s1.id);
  const s2 = W.startSession(d, b.id, '2026-11-03');
  W.addSet(d, s2.id, bench.id, 70, 12);                  // жим в другой тренировке
  W.finishSession(d, s2.id);
  const s3 = W.startSession(d, a.id, '2026-11-05');
  const lt = W.lastTime(d, bench.id, a.id, s3.id);
  assert.equal(lt.date, '2026-11-01'); assert.equal(lt.sameWorkout, true);
  assert.equal(W.shouldIncrease(lt.sets, 10), true);
  assert.equal(W.shouldIncrease([{ weight: 80, reps: 10 }, { weight: 75, reps: 10 }], 10), false);
  assert.equal(W.shouldIncrease([{ weight: 80, reps: 10 }, { weight: 80, reps: 9 }], 10), false);
  assert.equal(W.suggestedWeight([], lt), 80);
  W.addSet(d, s3.id, bench.id, 82.5, 8);
  assert.equal(W.suggestedWeight(W.setsOf(d, s3.id, bench.id), lt), 82.5);
  const other = W.lastTime(d, curl.id, a.id, s3.id);
  assert.equal(other, null);
});

test('завершение, пустая сессия, автозавершение', async () => {
  const { d, a, b, bench } = await setup();
  const empty = W.startSession(d, a.id, '2026-11-05');
  assert.equal(W.finishSession(d, empty.id), null);
  assert.equal(d.get('sessions', empty.id), null, 'пустая удалена');

  const old = W.startSession(d, b.id, '2026-11-04');
  W.addSet(d, old.id, bench.id, 60, 10);
  const sm = W.autofinishStale(d, '2026-11-06');
  assert.equal(sm.length, 1); assert.equal(sm[0].auto, true); assert.equal(sm[0].totalSets, 1);
  assert.equal(W.openSession(d), null);

  const today = W.startSession(d, a.id, '2026-11-06');
  assert.deepEqual(W.autofinishStale(d, '2026-11-06'), [], 'сегодняшнюю не трогаем');
  assert.equal(W.openSession(d).id, today.id);
});
