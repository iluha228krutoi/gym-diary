// Резервная копия (п. 9 ТЗ): JSON со всеми хранилищами и версией формата.

import { SCHEMA_VERSION } from './db.js';
import { InputError, daysBetween, isoDate, nowIso } from './core/util.js';

export const FORMAT = 'gym-diary-backup';
export const FORMAT_VERSION = 1;
export const REMIND_DAYS = 28;

export function makeBackup(data) {
  const dump = data.dump();
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    tables: dump.tables,
    meta: dump.meta,
  };
}

export function backupFileName(today = isoDate()) {
  return `gym_backup_${today}.json`;
}

// Проверяет файл копии и возвращает краткие сведения о нём
export function inspectBackup(obj) {
  if (!obj || obj.format !== FORMAT) throw new InputError('Это не резервная копия дневника тренировок.');
  if (obj.formatVersion > FORMAT_VERSION || obj.schemaVersion > SCHEMA_VERSION) {
    throw new InputError('Копия сделана более новой версией приложения — сначала обнови приложение.');
  }
  const t = obj.tables;
  if (!t || typeof t !== 'object') throw new InputError('Файл копии повреждён.');
  for (const name of ['exercises', 'plans', 'workouts', 'planExercises', 'sessions', 'sets']) {
    if (!Array.isArray(t[name])) throw new InputError('Файл копии повреждён.');
    if (t[name].some(r => typeof r?.id !== 'number')) throw new InputError('Файл копии повреждён.');
  }
  const withSets = new Set(t.sets.map(s => s.sessionId));
  const sessions = t.sessions.filter(s => withSets.has(s.id));
  const last = sessions.map(s => s.date).sort().at(-1) ?? null;
  return { sessions: sessions.length, lastSession: last, exercises: t.exercises.length, exportedAt: obj.exportedAt };
}

export async function restoreBackup(data, obj) {
  inspectBackup(obj);
  const meta = { ...(obj.meta || {}) };
  meta.lastBackupAt = nowIso();  // данные совпадают с копией — напоминание не нужно
  await data.replaceAll({ tables: obj.tables, meta });
}

export function backupReminderNeeded(data, today = isoDate()) {
  const last = data.meta.lastBackupAt;
  const hasData = data.all('sets').length > 0;
  if (!hasData) return false;
  if (!last) {
    const first = data.meta.firstSetDate ?? data.all('sessions').map(s => s.date).sort()[0];
    return first ? daysBetween(first, today) >= REMIND_DAYS : false;
  }
  return daysBetween(isoDate(new Date(last)), today) >= REMIND_DAYS;
}
