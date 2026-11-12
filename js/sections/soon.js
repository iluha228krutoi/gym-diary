// Временные заглушки разделов, которые появятся на следующих этапах.
import { h } from '../ui.js';

const soon = (title, text) => () => ({
  title,
  body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Скоро'), h('p', {}, text)),
});

export const routes = [
  { path: /^progress$/, render: soon('Прогресс', 'Анализ прогресса с графиками — на одном из следующих этапов.') },
];
