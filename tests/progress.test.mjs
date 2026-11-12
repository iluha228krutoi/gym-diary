import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Data, MemoryPersist } from '../js/data.js';
import * as P from '../js/core/plans.js';
import * as W from '../js/core/workouts.js';
import * as G from '../js/core/progress.js';
import { addDays } from '../js/core/util.js';

const T = '2026-11-11';

async function seeded() {
  const d = new Data(new MemoryPersist()); await d.load();
  const plan = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 }, '2026-08-01');
  const a = P.addWorkout(d, plan.id, 'А');
  const bench = P.createExercise(d, 'Жим', false);
  const dips = P.createExercise(d, 'Брусья', true);
  const data = [
    [65, [[70, 8]], [[0, 10]]],
    [58, [[72.5, 8], [72.5, 8]], [[0, 11]]],
    [52, [[75, 6]], [[0, 12]]],
    [40, [[75, 8], [75, 7]], [[0, 12]]],
    [33, [[80, 6], [77.5, 8]], [[0, 14]]],
    [12, [[72.5, 8], [70, 8]], [[0, 11]]],
    [9, [[75, 8]], [[0, 12]]],
    [2, [[80, 7], [77.5, 8]], [[5, 8]]],
  ];
  for (const [ago, bs, ds] of data) {
    const s = W.startSession(d, a.id, addDays(T, -ago));
    for (const [w, r] of bs) W.addSet(d, s.id, bench.id, w, r);
    for (const [w, r] of ds) W.addSet(d, s.id, dips.id, w, r);
    W.finishSession(d, s.id);
  }
  return { d, bench, dips };
}

test('сводка за 1 и 2 месяца: тренировки, ожидаемое, перерывы', async () => {
  const { d } = await seeded();
  const m1 = G.overview(d, 1, T);
  assert.equal(m1.start, '2026-10-13');
  assert.equal(m1.sessions, 3);
  assert.equal(m1.expected, 13);                     // 3 в неделю × 30 дней
  assert.deepEqual(m1.breaks, []);
  const m2 = G.overview(d, 2, T);
  assert.equal(m2.sessions, 7);
  assert.deepEqual(m2.breaks.map(b => [b.from, b.to, b.days]),
    [['2026-09-21', '2026-10-01', 11], ['2026-10-10', '2026-10-29', 20]]);
});

test('ожидаемое — от первой тренировки по плану', async () => {
  const d = new Data(new MemoryPersist()); await d.load();
  const plan = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 }, '2026-10-01');
  const a = P.addWorkout(d, plan.id, 'А');
  const ex = P.createExercise(d, 'Жим', false);
  assert.equal(G.overview(d, 1, T).expected, null, 'план не начат');
  const s = W.startSession(d, a.id, '2026-11-05'); W.addSet(d, s.id, ex.id, 50, 10); W.finishSession(d, s.id);
  assert.equal(G.overview(d, 1, T).expected, 3);    // 7 дней × 3/7
});

test('упражнение: изменения, объём, процент от рекорда', async () => {
  const { d } = await seeded();
  const m1 = G.overview(d, 1, T);
  const bench = m1.exercises.find(e => e.exercise.name === 'Жим');
  assert.equal(bench.points.length, 3);
  assert.deepEqual([bench.first.best.weight, bench.first.best.reps], [72.5, 8]);
  assert.deepEqual([bench.last.best.weight, bench.last.best.reps], [80, 7]);
  assert.equal(Math.round(bench.changePct * 10) / 10, 7.4);
  assert.equal(Math.round(bench.ofPrPct), 100);
  const dips = m1.exercises.find(e => e.exercise.name === 'Брусья');
  assert.equal(dips.changePct, null, 'разный доп. вес — проценты не считаем');
  assert.equal(dips.volumePct, null);
  assert.equal(dips.ofPrPct, 100);
  assert.equal(G.overview(d, 1, '2027-06-01').exercises.length, 0, 'за период без тренировок пусто');
});
