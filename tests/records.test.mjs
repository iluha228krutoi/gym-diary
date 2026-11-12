import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Data, MemoryPersist } from '../js/data.js';
import * as P from '../js/core/plans.js';
import * as W from '../js/core/workouts.js';
import * as R from '../js/core/records.js';

const S = (weight, reps, date = '2026-11-01', sessionId = 1) => ({ weight, reps, date, sessionId });

test('расчёты: лучший подход и таблицы', () => {
  const prior = [S(80, 10, '2026-10-01', 1), S(90, 5, '2026-10-05', 2), S(85, 8, '2026-10-08', 3)];
  assert.equal(R.bestSet(prior, false).weight, 85);        // 85×8 ≈ 107.7 > 90×5 = 105
  assert.deepEqual(R.repTable(prior, false).map(r => [r.key, r.value]), [[5, 90], [8, 85], [10, 80]]);
  // «минимум на N повторов»: 90×10 закрывает и строку 8
  assert.deepEqual(R.repTable([S(85, 8), S(90, 10)], false).map(r => [r.key, r.value]), [[8, 90], [10, 90]]);
  const bw = [S(0, 12), S(5, 10)];
  assert.deepEqual(R.repTable(bw, true).map(r => [r.key, r.value]), [[0, 12], [5, 10]]);
  assert.deepEqual(R.bestSet(bw, true), bw[1]);
});

test('новые рекорды', () => {
  const prior = [S(80, 10), S(90, 5), S(85, 8)];
  assert.deepEqual(R.newRecords(prior, [S(87.5, 8)], false), ['лучший подход 87.5×8 (был 85×8)']);
  assert.deepEqual(R.newRecords(prior, [S(80, 9)], false), []);
  assert.deepEqual(R.newRecords(prior, [S(91, 5)], false), ['рекорд веса на 5 повторений']);
  assert.deepEqual(R.newRecords(prior, [S(92.5, 5)], false), ['лучший подход 92.5×5 (был 85×8)']);
  assert.deepEqual(R.newRecords([], [S(80, 9)], false), [], 'впервые — без рекордов');
  const bw = [S(0, 12), S(5, 10)];
  assert.deepEqual(R.newRecords(bw, [S(0, 15)], true), ['рекорд повторов: свой вес']);
  assert.deepEqual(R.newRecords(bw, [S(10, 6)], true), ['лучший подход +10×6 (был +5×10)']);
});

test('рекорды на данных: при вводе и за тренировку', async () => {
  const d = new Data(new MemoryPersist()); await d.load();
  const p = P.createPlan(d, { name: 'P', perWeek: 3, weeks: 8 });
  const a = P.addWorkout(d, p.id, 'А');
  const ex = P.createExercise(d, 'Жим', false);
  P.addPlanExercise(d, a.id, ex.id, 6, 10);

  const s1 = W.startSession(d, a.id, '2026-11-01');
  assert.deepEqual(R.liveRecords(d, s1, ex.id, false, 50, 10), [], 'первая тренировка');
  W.addSet(d, s1.id, ex.id, 50, 10);
  assert.deepEqual(R.liveRecords(d, s1, ex.id, false, 60, 10), [], 'всё ещё первая тренировка');
  W.addSet(d, s1.id, ex.id, 60, 10);
  W.finishSession(d, s1.id);
  assert.deepEqual(W.summary(d, s1.id).exercises.length, 1);
  assert.deepEqual(R.sessionRecords(d, d.get('sessions', s1.id), ex.id, false), []);

  const s2 = W.startSession(d, a.id, '2026-11-03');
  assert.equal(R.liveRecords(d, s2, ex.id, false, 62.5, 10).length, 1);
  W.addSet(d, s2.id, ex.id, 62.5, 10);
  assert.deepEqual(R.liveRecords(d, s2, ex.id, false, 62.5, 10), [], 'повтор того же — не рекорд');
  W.finishSession(d, s2.id);
  assert.equal(R.sessionRecords(d, d.get('sessions', s2.id), ex.id, false).length, 1);
  assert.equal(R.exercisesWithHistory(d).length, 1);
  assert.equal(R.bestSet(R.exerciseHistory(d, ex.id), false).date, '2026-11-03');
});
