// Раздел «План» (п. 4 ТЗ): просмотр и редактирование плана, тренировок и упражнений.

import * as P from '../core/plans.js';
import { InputError, checkRange, cleanName, fmtRange, parseIntIn, plural } from '../core/util.js';
import { confirmSheet, field, formSheet, h, icon, numInput, openSheet, toast } from '../ui.js';

export const routes = [
  { path: /^plan$/, render: planPage },
  { path: /^plan\/exercises$/, render: exercisesPage },
  { path: /^plan\/workout\/(\d+)$/, render: workoutPage },
];

// ================================================================ страница плана

function planPage(ctx) {
  const { data } = ctx;
  const plan = P.activePlan(data);
  if (!plan) {
    return {
      title: 'План',
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Плана пока нет'),
        h('p', {}, 'Создай план, добавь в него тренировки и упражнения — и можно идти в зал.'),
        h('button', { class: 'btn primary', onclick: () => editPlan(ctx, null) }, 'Создать план'),
        data.all('exercises').length
          ? h('a', { class: 'btn ghost', href: '#/plan/exercises' }, 'Все упражнения') : null),
    };
  }

  const st = P.planStats(data, plan);
  const workouts = P.listWorkouts(data, plan.id);
  const pct = st.started ? Math.min(100, Math.round((st.dayNo / st.totalDays) * 100)) : 0;
  const termText = !st.started
    ? 'План ещё не начат — отсчёт пойдёт с первой тренировки'
    : st.overdue ? `Срок пройден · ${st.dayNo}-й день` : `${st.dayNo}-й день из ~${st.totalDays}`;

  const head = h('section', { class: 'plan-head' },
    h('div', { class: 'plan-title-row' },
      h('h2', { class: 'plan-name' }, plan.name),
      h('button', { class: 'btn small', onclick: () => editPlan(ctx, plan) }, 'Изменить')),
    h('p', { class: 'muted' },
      `${plan.workoutsPerWeek} ${plural(plan.workoutsPerWeek, 'тренировка', 'тренировки', 'тренировок')} в неделю, ` +
      `ориентировочно ${plan.durationWeeks} ${plural(plan.durationWeeks, 'неделя', 'недели', 'недель')}`),
    h('div', { class: `term ${st.overdue ? 'overdue' : ''}`, role: 'img', 'aria-label': termText },
      h('div', { class: 'term-bar' }, h('div', { class: 'term-fill', style: `width:${pct}%` })),
      h('p', { class: 'term-text' }, termText,
        st.started ? h('span', {}, `тренировок: ${st.sessions}`) : null)),
  );

  const list = workouts.length
    ? h('ol', { class: 'workout-list' }, workouts.map(w => {
        const exs = P.listPlanExercises(data, w.id);
        return h('li', {},
          h('a', { class: 'workout-card', href: `#/plan/workout/${w.id}` },
            h('div', { class: 'workout-card-head' },
              h('span', { class: 'workout-pos' }, w.position),
              h('span', { class: 'workout-name' }, w.name),
              icon('chevron', 'icon chev')),
            exs.length
              ? h('ul', { class: 'ex-mini' }, exs.map(pe =>
                  h('li', {}, h('span', {}, pe.name), h('span', { class: 'range' }, fmtRange(pe.repMin, pe.repMax)))))
              : h('p', { class: 'muted small' }, 'Упражнений пока нет')));
      }))
    : h('p', { class: 'muted pad' }, 'Тренировок пока нет. Добавь первую — например «А» или «Верх».');

  return {
    title: 'План',
    body: h('div', { class: 'stack' },
      head,
      h('h3', { class: 'section-label' }, 'Тренировки по очереди'),
      list,
      h('button', { class: 'btn wide', onclick: () => addWorkout(ctx, plan) }, icon('plus'), 'Добавить тренировку'),
      h('a', { class: 'btn wide', href: '#/plan/exercises' }, 'Все упражнения'),
      h('button', { class: 'btn ghost wide', onclick: () => newPlan(ctx) }, 'Начать новый план'),
      h('button', { class: 'btn ghost danger-text wide', onclick: () => deletePlan(ctx, plan) }, 'Удалить план')),
  };
}

async function deletePlan(ctx, plan) {
  const st = P.planStats(ctx.data, plan);
  const text = st.sessions
    ? `План «${plan.name}» исчезнет из приложения. История тренировок и рекорды сохранятся.`
    : `План «${plan.name}» и его тренировки будут удалены. Упражнения останутся в общем списке.`;
  if (!await confirmSheet('Удалить план?', text, { ok: 'Удалить план', danger: true })) return;
  P.deletePlan(ctx.data, plan.id);
  toast('План удалён');
  ctx.refresh();
}

// ================================================================ справочник упражнений (п. 4.6 ТЗ)

function usageText(u) {
  const parts = [];
  if (u.workouts.length) parts.push(`в плане: ${u.workouts.join(', ')}`);
  if (u.sets) parts.push(`${u.sets} ${plural(u.sets, 'подход', 'подхода', 'подходов')} в истории`);
  return parts.join(' · ') || 'нигде не используется';
}

function exercisesPage(ctx) {
  const { data } = ctx;
  const all = P.listExercises(data);
  return {
    title: 'Все упражнения',
    back: '#/plan',
    body: all.length
      ? h('div', { class: 'stack' },
          h('p', { class: 'muted' }, 'Нажми на упражнение, чтобы переименовать или удалить его.'),
          h('ul', { class: 'ex-list' }, all.map(e => h('li', { class: 'ex-row' },
            h('button', { class: 'ex-main', onclick: () => exerciseActions(ctx, e) },
              h('span', { class: 'ex-name' }, e.name, e.isBodyweight ? h('span', { class: 'tag' }, 'свой вес') : null,
                h('small', { class: 'ex-usage' }, usageText(P.exerciseUsage(data, e.id)))),
              icon('chevron', 'icon chev'))))))
      : h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Упражнений пока нет'),
          h('p', {}, 'Они появятся, когда ты добавишь их в тренировки плана.')),
  };
}

async function exerciseActions(ctx, ex) {
  const action = await openSheet(ex.name, (close) => h('div', { class: 'stack tight' },
    h('p', { class: 'muted' }, usageText(P.exerciseUsage(ctx.data, ex.id))),
    h('button', { class: 'btn wide', type: 'button', onclick: () => close('rename') }, 'Переименовать'),
    h('button', { class: 'btn ghost danger-text wide', type: 'button', onclick: () => close('delete') }, 'Удалить упражнение')));

  if (action === 'rename') {
    const ok = await formSheet('Название упражнения', {
      fields: [
        field('Название', h('input', { name: 'name', value: ex.name, maxlength: 40 })),
        h('p', { class: 'muted small' }, 'История и рекорды сохранятся под новым названием.'),
      ],
      onSubmit: (f) => P.renameExercise(ctx.data, ex.id, f.name.value),
    });
    if (ok) ctx.refresh();
  } else if (action === 'delete') {
    const u = P.exerciseUsage(ctx.data, ex.id);
    const lines = [];
    if (u.workouts.length) lines.push(`Уберётся из тренировок: ${u.workouts.join(', ')}.`);
    if (u.sets) {
      lines.push(`Удалятся ${u.sets} ${plural(u.sets, 'подход', 'подхода', 'подходов')} из ` +
        `${u.sessions} ${plural(u.sessions, 'тренировки', 'тренировок', 'тренировок')} и рекорды по упражнению. Это нельзя отменить.`);
    }
    if (!lines.length) lines.push('Упражнение нигде не используется.');
    if (!await confirmSheet(`Удалить «${ex.name}»?`, lines.join(' '), { ok: 'Удалить', danger: true })) return;
    P.deleteExercise(ctx.data, ex.id);
    toast('Упражнение удалено');
    ctx.refresh();
  }
}

async function editPlan(ctx, plan) {
  const ok = await formSheet(plan ? 'Изменить план' : 'Новый план', {
    submit: plan ? 'Сохранить' : 'Создать план',
    fields: [
      field('Название', h('input', { name: 'name', value: plan?.name ?? '', placeholder: 'Например, Верх/Низ', maxlength: 40 })),
      h('div', { class: 'field-pair' },
        field('Тренировок в неделю', numInput('perWeek', plan?.workoutsPerWeek ?? 3)),
        field('Срок, недель', numInput('weeks', plan?.durationWeeks ?? 8), 'ориентировочно')),
    ],
    onSubmit: (f) => {
      const v = {
        name: f.name.value,
        perWeek: parseIntIn(f.perWeek.value, 1, 7, 'Тренировок в неделю'),
        weeks: parseIntIn(f.weeks.value, 1, 52, 'Срок плана'),
      };
      if (plan) {
        P.updatePlan(ctx.data, plan.id, {
          name: cleanName(v.name), workoutsPerWeek: v.perWeek, durationWeeks: v.weeks,
        });
      } else {
        P.createPlan(ctx.data, v);
      }
    },
  });
  if (ok) { if (!plan) toast('План создан — добавь тренировки'); ctx.refresh(); }
}

async function newPlan(ctx) {
  const yes = await confirmSheet('Новый план',
    'Текущий план уйдёт в архив. История тренировок и рекорды сохранятся.', { ok: 'Продолжить' });
  if (yes) editPlan(ctx, null);
}

async function addWorkout(ctx, plan) {
  let created;
  const ok = await formSheet('Новая тренировка', {
    submit: 'Добавить',
    fields: [field('Название', h('input', { name: 'name', placeholder: 'А, Верх, Ноги…', maxlength: 40 }))],
    onSubmit: (f) => { created = P.addWorkout(ctx.data, plan.id, f.name.value); },
  });
  if (ok && created) ctx.go(`#/plan/workout/${created.id}`);
}

// ================================================================ страница тренировки

function workoutPage(ctx, [id]) {
  const { data } = ctx;
  const w = data.get('workouts', Number(id));
  if (!w || w.isDeleted) return ctx.redirect('#/plan');
  const exs = P.listPlanExercises(data, w.id);
  const all = P.listWorkouts(data, w.planId);

  const rows = exs.length
    ? h('ol', { class: 'ex-list' }, exs.map((pe, i) => h('li', { class: 'ex-row' },
        h('button', { class: 'ex-main', onclick: () => exerciseSheet(ctx, pe) },
          h('span', { class: 'ex-pos' }, i + 1),
          h('span', { class: 'ex-name' }, pe.name, pe.isBodyweight ? h('span', { class: 'tag' }, 'свой вес') : null),
          h('span', { class: 'range big' }, fmtRange(pe.repMin, pe.repMax))),
        h('div', { class: 'reorder' },
          h('button', { class: 'icon-btn', 'aria-label': 'Выше', disabled: i === 0,
            onclick: () => { P.movePlanExercise(data, pe.id, -1); ctx.refresh(); } }, icon('up')),
          h('button', { class: 'icon-btn', 'aria-label': 'Ниже', disabled: i === exs.length - 1,
            onclick: () => { P.movePlanExercise(data, pe.id, 1); ctx.refresh(); } }, icon('down'))))))
    : h('p', { class: 'muted pad' }, 'Добавь упражнения, которые делаешь в этой тренировке.');

  const idx = all.findIndex(x => x.id === w.id);
  return {
    title: `Тренировка ${w.position}`,
    back: '#/plan',
    body: h('div', { class: 'stack' },
      h('div', { class: 'plan-title-row' },
        h('h2', { class: 'plan-name' }, w.name),
        h('button', { class: 'btn small', onclick: () => renameWorkout(ctx, w) }, 'Переименовать')),
      h('p', { class: 'muted' }, 'Нажми на упражнение, чтобы изменить диапазон, заменить или убрать его.'),
      rows,
      h('button', { class: 'btn primary wide', onclick: () => addExercise(ctx, w) }, icon('plus'), 'Добавить упражнение'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', disabled: idx === 0,
          onclick: () => { P.moveWorkout(data, w.id, -1); ctx.refresh(); } }, icon('up'), 'Раньше'),
        h('button', { class: 'btn', disabled: idx === all.length - 1,
          onclick: () => { P.moveWorkout(data, w.id, 1); ctx.refresh(); } }, icon('down'), 'Позже')),
      h('button', { class: 'btn ghost danger-text wide', onclick: () => deleteWorkout(ctx, w) }, 'Удалить тренировку из плана')),
  };
}

async function renameWorkout(ctx, w) {
  const ok = await formSheet('Название тренировки', {
    fields: [field('Название', h('input', { name: 'name', value: w.name, maxlength: 40 }))],
    onSubmit: (f) => P.renameWorkout(ctx.data, w.id, f.name.value),
  });
  if (ok) ctx.refresh();
}

async function deleteWorkout(ctx, w) {
  const yes = await confirmSheet('Удалить тренировку?',
    `«${w.name}» уйдёт из плана. История и рекорды по её упражнениям сохранятся.`, { ok: 'Удалить', danger: true });
  if (yes) { P.deleteWorkout(ctx.data, w.id); ctx.go('#/plan'); }
}

// ---------------------------------------------------------------- выбор упражнения

/**
 * Лист выбора упражнения: поиск по названию, список существующих, создание нового.
 * Возвращает { exercise, isNew } или undefined.
 */
export function pickExercise(ctx, { title, exclude = new Set() }) {
  const { data } = ctx;
  return openSheet(title, (close, setError) => {
    const input = h('input', { name: 'q', placeholder: 'Начни вводить название', autocomplete: 'off', maxlength: 40 });
    const list = h('ul', { class: 'pick-list' });
    const bw = h('input', { type: 'checkbox', name: 'bw', 'data-noautofocus': '1' });
    const newBox = h('div', { class: 'new-ex', hidden: true },
      h('label', { class: 'check' }, bw, h('span', {}, 'С собственным весом',
        h('small', {}, 'брусья, подтягивания: вес — это доп. отягощение'))));

    const render = () => {
      const q = input.value.trim().replace(/\s+/g, ' ');
      const ql = q.toLocaleLowerCase('ru');
      const matches = P.listExercises(data)
        .filter(e => !exclude.has(e.id) && (!q || e.name.toLocaleLowerCase('ru').includes(ql)));
      const exact = q && P.findExercise(data, q);
      list.replaceChildren(...[
        ...matches.map(e => h('li', {}, h('button', { type: 'button', class: 'pick',
          onclick: () => close({ exercise: e, isNew: false }) },
          e.name, e.isBodyweight ? h('span', { class: 'tag' }, 'свой вес') : null))),
        q && !exact ? h('li', {}, h('button', { type: 'button', class: 'pick create',
          onclick: () => create(q) }, icon('plus'), `Создать «${q}»`)) : null,
      ].filter(Boolean));
      if (!matches.length && !q) list.append(h('li', { class: 'muted small pad' }, 'Упражнений ещё нет — напиши название нового.'));
      newBox.hidden = !(q && !exact);
    };
    const create = (q) => {
      try {
        const ex = P.createExercise(data, q, bw.checked);
        close({ exercise: ex, isNew: true });
      } catch (e) { setError(e.message); }
    };
    input.addEventListener('input', () => { setError(''); render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = input.value.trim();
      const exact = q && P.findExercise(data, q);
      if (exact && !exclude.has(exact.id)) close({ exercise: exact, isNew: false });
      else if (q && !exact) create(q);
    });
    render();
    return h('div', { class: 'picker' }, input, newBox, list);
  });
}

async function addExercise(ctx, w) {
  const taken = new Set(P.listPlanExercises(ctx.data, w.id).map(pe => pe.exerciseId));
  const picked = await pickExercise(ctx, { title: 'Добавить упражнение', exclude: taken });
  if (!picked) return;
  const ok = await rangeSheet(`Диапазон: ${picked.exercise.name}`, null, null, (lo, hi) => {
    P.addPlanExercise(ctx.data, w.id, picked.exercise.id, lo, hi);
  });
  if (ok) ctx.refresh();
  else if (picked.isNew) toast(`«${picked.exercise.name}» создано, но не добавлено в тренировку`);
}

function rangeSheet(title, lo, hi, save) {
  return formSheet(title, {
    submit: 'Сохранить',
    fields: [
      h('p', { class: 'muted small' }, 'В каком диапазоне повторений работаешь. Дошёл до верхней границы во всех подходах — пора прибавлять вес.'),
      h('div', { class: 'field-pair' },
        field('От', numInput('lo', lo ?? '', { placeholder: '8' })),
        field('До', numInput('hi', hi ?? '', { placeholder: '16' }))),
    ],
    onSubmit: (f) => {
      if (!f.lo.value.trim() || !f.hi.value.trim()) throw new InputError('Заполни обе границы диапазона.');
      const [a, b] = checkRange(f.lo.value, f.hi.value);
      save(a, b);
    },
  });
}

async function exerciseSheet(ctx, pe) {
  const action = await openSheet(pe.name, (close) => h('div', { class: 'stack tight' },
    h('p', { class: 'muted' }, `Диапазон: ${fmtRange(pe.repMin, pe.repMax)} · ${pe.isBodyweight ? 'с собственным весом' : 'обычное'}`),
    h('button', { class: 'btn wide', type: 'button', onclick: () => close('range') }, 'Изменить диапазон'),
    h('button', { class: 'btn wide', type: 'button', onclick: () => close('replace') }, 'Заменить другим упражнением'),
    h('button', { class: 'btn ghost danger-text wide', type: 'button', onclick: () => close('remove') }, 'Убрать из тренировки')));

  if (action === 'range') {
    if (await rangeSheet(`Диапазон: ${pe.name}`, pe.repMin, pe.repMax,
      (lo, hi) => P.setRange(ctx.data, pe.id, lo, hi))) ctx.refresh();
  } else if (action === 'replace') {
    const taken = new Set(P.listPlanExercises(ctx.data, pe.workoutId).map(x => x.exerciseId));
    const picked = await pickExercise(ctx, { title: `Заменить «${pe.name}»`, exclude: taken });
    if (picked) { P.replacePlanExercise(ctx.data, pe.id, picked.exercise.id); ctx.refresh(); }
  } else if (action === 'remove') {
    const yes = await confirmSheet('Убрать упражнение?',
      `«${pe.name}» уйдёт из этой тренировки. История и рекорды сохранятся.`, { ok: 'Убрать', danger: true });
    if (yes) { P.removePlanExercise(ctx.data, pe.id); ctx.refresh(); }
  }
}
