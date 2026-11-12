// Общие функции: форматирование и разбор ввода. Без DOM и без базы — тестируются в node.

export class InputError extends Error {
  constructor(msg) { super(msg); this.name = 'InputError'; }
}

export const NAME_MAX = 40;

export function plural(n, one, few, many) {
  n = Math.abs(n);
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return few;
  return many;
}

export function cleanName(text, what = 'Название') {
  const name = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new InputError(`${what} не может быть пустым.`);
  if (name.length > NAME_MAX) throw new InputError(`${what} слишком длинное (максимум ${NAME_MAX} символов).`);
  return name;
}

export function parseIntIn(text, lo, hi, what) {
  const t = String(text ?? '').trim();
  if (!/^\d+$/.test(t)) throw new InputError(`${what}: введи целое число от ${lo} до ${hi}.`);
  const n = Number(t);
  if (n < lo || n > hi) throw new InputError(`${what}: число должно быть от ${lo} до ${hi}.`);
  return n;
}

export function checkRange(lo, hi) {
  lo = Number(lo); hi = Number(hi);
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new InputError('Диапазон: введи целые числа.');
  if (lo < 1 || hi > 100) throw new InputError('Повторы должны быть от 1 до 100.');
  if (lo > hi) throw new InputError('Нижняя граница больше верхней.');
  return [lo, hi];
}

export const MAX_WEIGHT = 500;
export const MAX_REPS = 100;

export function parseWeight(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) throw new InputError('Вес: введи число, например 80 или 22.5.');
  const w = Number(t);
  if (w > MAX_WEIGHT) throw new InputError(`Вес ${fmtWeight(w)} — многовато. Проверь ввод.`);
  return w;
}

export function parseReps(text) {
  const t = String(text ?? '').trim();
  if (!/^\d{1,3}$/.test(t)) throw new InputError('Повторы: введи целое число.');
  const r = Number(t);
  if (r < 1 || r > MAX_REPS) throw new InputError(`Повторы должны быть от 1 до ${MAX_REPS}.`);
  return r;
}

export function fmtWeight(w) {
  return String(Math.round(w * 100) / 100);
}

export function fmtSet(weight, reps, bodyweight) {
  if (bodyweight && weight > 0) return `+${fmtWeight(weight)}×${reps}`;
  return `${fmtWeight(weight)}×${reps}`;
}

export function fmtSets(sets, bodyweight) {
  return sets.map(s => fmtSet(s.weight, s.reps, bodyweight)).join(', ');
}

export function fmtRange(lo, hi) {
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

// Даты храним строками 'YYYY-MM-DD' по местному времени телефона
export function isoDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(aIso, bIso) {
  return Math.round((parseIso(bIso) - parseIso(aIso)) / 86400000);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function fmtDate(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function sortByName(rows) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
}

export function sameName(a, b) {
  return a.localeCompare(b, 'ru', { sensitivity: 'base' }) === 0;
}
