// Раздел «Тренировка» (п. 5 ТЗ): выбор тренировки, запись подходов, завершение.

import * as P from '../core/plans.js';
import * as W from '../core/workouts.js';
import * as R from '../core/records.js';
import { fmtDate, fmtRange, fmtSet, fmtWeight, parseReps, parseWeight, plural } from '../core/util.js';
import { confirmSheet, h, icon, openSheet, toast } from '../ui.js';
import { pickExercise } from './plan.js';

export const routes = [
  { path: /^workout$/, render: workoutHome },
  { path: /^workout\/done\/(\d+)$/, render: donePage },
];

// Рекорд, побитый последним подходом: показывается на экране один раз
let flash = null;

function workoutHome(ctx) {
  const session = W.openSession(ctx.data);
  return session ? exerciseScreen(ctx, session) : chooseScreen(ctx);
}

// ================================================================ выбор тренировки

function chooseScreen(ctx) {
  const { data } = ctx;
  const plan = P.activePlan(data);
  const workouts = plan ? P.listWorkouts(data, plan.id) : [];
  if (!workouts.length) {
    return {
      title: 'Тренировка',
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, plan ? 'В плане нет тренировок' : 'Сначала составь план'),
        h('p', {}, 'Тренировки и упражнения задаются в разделе «План».'),
        h('a', { class: 'btn primary', href: '#/plan' }, 'Открыть план')),
    };
  }
  const next = W.nextWorkout(data, plan);
  const start = (w) => { W.startSession(data, w.id); ctx.go('#/workout'); };

  return {
    title: 'Тренировка',
    body: h('div', { class: 'stack' },
      h('p', { class: 'lead' }, 'Какая тренировка сегодня?'),
      h('ol', { class: 'choose-list' }, workouts.map(w => {
        const isNext = w.id === next.id;
        const exs = P.listPlanExercises(data, w.id);
        return h('li', {}, h('button', { class: `choose ${isNext ? 'next' : ''}`, onclick: () => start(w) },
          h('span', { class: 'workout-pos' }, w.position),
          h('span', { class: 'choose-text' },
            h('span', { class: 'choose-name' }, w.name),
            h('span', { class: 'choose-sub' },
              isNext ? 'Следующая по очереди · ' : '',
              exs.length ? `${exs.length} ${plural(exs.length, 'упражнение', 'упражнения', 'упражнений')}` : 'без упражнений')),
          icon('chevron', 'icon chev')));
      }))),
  };
}

// ================================================================ экран упражнения

function exerciseScreen(ctx, session) {
  const { data } = ctx;
  const workout = data.get('workouts', session.workoutId);
  const items = W.sessionExercises(data, session);

  if (!items.length) {
    return {
      title: workout.name,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, 'В этой тренировке пока нет упражнений.'),
        h('button', { class: 'btn primary wide', onclick: () => addOffPlan(ctx, session) }, icon('plus'), 'Добавить упражнение'),
        h('button', { class: 'btn ghost wide', onclick: () => finish(ctx, session) }, 'Завершить тренировку')),
    };
  }

  const idx = W.currentIndex(session, items);
  const ex = items[idx];
  if (session.currentExerciseId !== ex.exerciseId) W.setCurrent(data, session.id, ex.exerciseId);
  const last = W.lastTime(data, ex.exerciseId, session.workoutId, session.id);
  const increase = ex.planned && last && W.shouldIncrease(last.sets, ex.repMax);
  const bw = ex.isBodyweight;

  // ---------- шапка упражнения
  const head = h('section', { class: 'ex-head' },
    h('div', { class: 'ex-head-top' },
      h('span', { class: 'muted' }, `${workout.name} · ${idx + 1} из ${items.length}`),
      h('button', { class: 'btn small', onclick: () => showList(ctx, session) }, 'Все упражнения')),
    h('div', { class: 'ex-title-row' },
      h('h2', { class: 'ex-title' }, ex.name),
      ex.planned ? h('span', { class: 'range-chip', title: 'Диапазон повторений' }, fmtRange(ex.repMin, ex.repMax))
        : h('span', { class: 'tag' }, 'не по плану')),
    h('div', { class: 'last' },
      h('span', { class: 'last-label' }, last
        ? `Прошлый раз · ${fmtDate(last.date)}${last.sameWorkout ? '' : ` · «${last.workoutName}»`}`
        : 'Прошлый раз · ещё не делал'),
      last ? h('div', { class: 'set-chips' }, last.sets.map(s => h('span', { class: 'set-chip' }, fmtSet(s.weight, s.reps, bw)))) : null),
    increase ? h('p', { class: 'hint-up' }, icon('up'),
      `Во всех подходах дошёл до ${ex.repMax} — пора ${bw ? (last.sets[0].weight > 0 ? 'увеличить доп. вес' : 'добавить доп. вес') : 'увеличить вес'}`) : null);

  // ---------- только что побитый рекорд
  const record = flash && flash.exerciseId === ex.exerciseId ? flash.items : null;
  flash = null;
  const recordCard = record ? h('section', { class: 'record-card', role: 'status' },
    h('p', { class: 'record-title' }, '🏆 Новый рекорд!'),
    h('ul', {}, record.map(r => h('li', {}, r)))) : null;

  // ---------- сегодняшние подходы
  const today = h('section', { class: 'today' },
    h('h3', { class: 'section-label' }, 'Сегодня'),
    ex.sets.length
      ? h('ol', { class: 'today-sets' }, ex.sets.map((s, i) => h('li', {},
          h('span', { class: 'set-no' }, i + 1), h('span', { class: 'set-val' }, fmtSet(s.weight, s.reps, bw)))))
      : h('p', { class: 'muted' }, 'Подходов пока нет'));

  // ---------- ввод подхода
  const suggested = W.suggestedWeight(ex.sets, last);
  const weightIn = h('input', { class: 'big-num', id: 'weight', inputmode: 'decimal', autocomplete: 'off',
    value: suggested != null ? fmtWeight(suggested) : '', placeholder: '0', 'aria-label': bw ? 'Доп. вес, кг' : 'Вес, кг' });
  const repsIn = h('input', { class: 'big-num', id: 'reps', inputmode: 'numeric', autocomplete: 'off',
    placeholder: ex.repMin ? String(ex.repMin) : '—', 'aria-label': 'Повторы' });
  const err = h('p', { class: 'form-error', role: 'alert' });

  const step = (input, delta, base) => {
    const raw = input.value.trim().replace(',', '.');
    let v = raw === '' || Number.isNaN(Number(raw)) ? base(delta) : Number(raw) + delta;
    v = Math.max(0, Math.round(v * 100) / 100);
    input.value = fmtWeight(v);
    err.textContent = '';
  };
  const stepper = (label, input, delta, base) => h('div', { class: 'stepper' },
    h('span', { class: 'field-label' }, label),
    h('div', { class: 'stepper-row' },
      h('button', { class: 'step', type: 'button', 'aria-label': `Минус ${fmtWeight(delta)}`,
        onclick: () => step(input, -delta, base) }, `−${fmtWeight(delta)}`),
      input,
      h('button', { class: 'step', type: 'button', 'aria-label': `Плюс ${fmtWeight(delta)}`,
        onclick: () => step(input, delta, base) }, `+${fmtWeight(delta)}`)));

  const save = (e) => {
    e?.preventDefault();
    try {
      const w = parseWeight(weightIn.value || '0');
      const r = parseReps(repsIn.value);
      const items = R.liveRecords(data, session, ex.exerciseId, bw, w, r);
      W.addSet(data, session.id, ex.exerciseId, w, r);
      if (items.length) {
        flash = { exerciseId: ex.exerciseId, items };
        navigator.vibrate?.([60, 40, 120]);
      }
      ctx.refresh();
    } catch (ex2) {
      err.textContent = ex2.message;
    }
  };
  for (const inp of [weightIn, repsIn]) inp.addEventListener('input', () => { err.textContent = ''; });

  const entry = h('form', { class: 'entry', novalidate: true, onsubmit: save },
    h('div', { class: 'entry-grid' },
      stepper(bw ? 'Доп. вес, кг' : 'Вес, кг', weightIn, 2.5, (d) => Math.max(0, d)),
      stepper('Повторы', repsIn, 1, () => ex.repMin ?? 1)),
    err,
    h('button', { class: 'btn primary wide big', type: 'submit' }, 'Записать подход'),
    ex.sets.length ? h('button', { class: 'btn ghost wide', type: 'button', onclick: () => undo(ctx, session, ex) },
      'Удалить последний подход') : null);

  // ---------- навигация
  const isLast = idx === items.length - 1;
  const nav = h('div', { class: 'ex-nav' },
    h('button', { class: 'btn', disabled: idx === 0, onclick: () => go(ctx, session, items, idx - 1) },
      icon('back'), 'Назад'),
    h('button', { class: 'btn', onclick: () => (isLast ? showList(ctx, session) : go(ctx, session, items, idx + 1)) },
      isLast ? 'Список' : ex.sets.length ? 'Дальше' : 'Пропустить', icon('chevron')));

  return {
    title: 'Тренировка',
    body: h('div', { class: 'stack' }, head, recordCard, today, entry, nav,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => addOffPlan(ctx, session) }, icon('plus'), 'Не по плану'),
        h('button', { class: 'btn finish', onclick: () => finish(ctx, session) }, 'Завершить'))),
  };
}

function go(ctx, session, items, i) {
  if (i < 0 || i >= items.length) return;
  W.setCurrent(ctx.data, session.id, items[i].exerciseId);
  ctx.refresh();
  window.scrollTo({ top: 0 });
}

function undo(ctx, session, ex) {
  const removed = W.deleteLastSet(ctx.data, session.id, ex.exerciseId);
  if (removed) toast(`Удалён подход ${fmtSet(removed.weight, removed.reps, ex.isBodyweight)}`);
  ctx.refresh();
}

async function showList(ctx, session) {
  const items = W.sessionExercises(ctx.data, session);
  const cur = ctx.data.get('sessions', session.id).currentExerciseId;
  const picked = await openSheet('Упражнения тренировки', (close) => h('div', { class: 'stack tight' },
    h('ol', { class: 'session-list' }, items.map((e, i) => h('li', {},
      h('button', { type: 'button', class: `pick ${e.exerciseId === cur ? 'current' : ''}`, onclick: () => close(e.exerciseId) },
        h('span', { class: `done-mark ${e.sets.length ? 'on' : ''}`, 'aria-label': e.sets.length ? 'сделано' : 'не сделано' },
          e.sets.length ? '✓' : i + 1),
        h('span', { class: 'ex-name' }, e.name),
        h('span', { class: 'muted small' }, e.sets.length ? `${e.sets.length} подх.` : ''))))),
    h('button', { class: 'btn finish wide', type: 'button', onclick: () => close('finish') }, 'Завершить тренировку')));
  if (picked === 'finish') return finish(ctx, session);
  if (picked != null) { W.setCurrent(ctx.data, session.id, picked); ctx.refresh(); window.scrollTo({ top: 0 }); }
}

async function addOffPlan(ctx, session) {
  const inSession = new Set(W.sessionExercises(ctx.data, session).map(e => e.exerciseId));
  const picked = await pickExercise(ctx, { title: 'Упражнение не по плану', exclude: inSession });
  if (!picked) return;
  W.setCurrent(ctx.data, session.id, picked.exercise.id);
  ctx.refresh();
}

async function finish(ctx, session) {
  const done = W.sessionExercises(ctx.data, session).filter(e => e.sets.length).length;
  const text = done ? 'Записанные подходы сохранятся в истории.' : 'Подходов нет — тренировка не сохранится.';
  if (!await confirmSheet('Завершить тренировку?', text, { ok: 'Завершить' })) return;
  const sm = W.finishSession(ctx.data, session.id);
  if (!sm) { toast('Тренировка отменена — подходов не было'); ctx.go('#/workout'); return; }
  ctx.go(`#/workout/done/${sm.sessionId}`);
}

// ================================================================ сводка

export function summaryBody(sm) {
  return h('div', { class: 'summary' },
    sm.records?.length ? h('section', { class: 'record-card' },
      h('p', { class: 'record-title' }, '🏆 Рекорды за тренировку'),
      h('ul', {}, sm.records.map(r => h('li', {}, h('b', {}, r.name), ': ', r.items.join('; '))))) : null,
    h('ul', { class: 'summary-list' }, sm.exercises.map(e => h('li', {},
      h('span', { class: 'summary-name' }, e.name),
      h('span', { class: 'summary-sets' }, e.sets.map(s => fmtSet(s.weight, s.reps, e.isBodyweight)).join(', '))))),
    h('p', { class: 'muted' },
      `Итого: ${sm.exercises.length} ${plural(sm.exercises.length, 'упражнение', 'упражнения', 'упражнений')}, ` +
      `${sm.totalSets} ${plural(sm.totalSets, 'подход', 'подхода', 'подходов')}`));
}

function donePage(ctx, [id]) {
  const s = ctx.data.get('sessions', Number(id));
  if (!s || !s.finishedAt) return ctx.redirect('#/workout');
  const sm = W.summary(ctx.data, s.id);
  return {
    title: 'Готово',
    body: h('div', { class: 'stack' },
      h('div', { class: 'done-head' },
        h('p', { class: 'done-title' }, 'Тренировка завершена'),
        h('p', { class: 'muted' }, `${sm.workoutName} · ${fmtDate(sm.date)}`)),
      summaryBody(sm),
      h('a', { class: 'btn primary wide', href: '#/workout' }, 'К тренировкам')),
  };
}

/** Показывает сводки тренировок, которые закрылись автоматически (п. 5.4 ТЗ). */
export async function showAutoFinished(summaries) {
  for (const sm of summaries) {
    await openSheet('Тренировка завершена автоматически', (close) => h('div', { class: 'stack tight' },
      h('p', { class: 'muted' }, `${sm.workoutName} · ${fmtDate(sm.date)} — ты не нажал «Завершить», поэтому она закрылась сама.`),
      summaryBody(sm),
      h('button', { class: 'btn primary wide', type: 'button', onclick: () => close(true) }, 'Понятно')));
  }
}
