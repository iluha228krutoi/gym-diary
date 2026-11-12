# Дневник тренировок — приложение (PWA)

Веб-приложение, которое ставится на главный экран телефона и работает без интернета.
Все данные хранятся на телефоне (IndexedDB). Сервер не нужен.

## Попробовать на ноутбуке
Дважды кликни `start_app.bat` — откроется браузер с приложением (http://localhost:8080).
Чтобы увидеть «телефонный» вид: F12 → значок телефона (Ctrl+Shift+M).

## Структура
```
index.html, manifest.webmanifest, sw.js   — оболочка, установка, работа без интернета
css/app.css                               — оформление
js/main.js                                — запуск, навигация, вкладки
js/data.js, js/db.js                      — данные в памяти + IndexedDB с миграциями
js/backup.js                              — резервная копия (JSON)
js/core/                                  — логика без интерфейса (тестируется в node)
js/sections/                              — разделы: plan, settings, …
tests/                                    — тесты логики (node) и сквозные (Chrome)
```

## Как добавить новый раздел (например, «Питание»)
1. `js/sections/nutrition.js` с `routes`, логика — в `js/core/nutrition.js`.
2. Подключить модуль в `SECTIONS` и вкладку в `TABS` (js/main.js).
3. Новые хранилища — новой миграцией в конце `MIGRATIONS` (js/db.js). В резервную копию попадут сами.
4. Добавить файлы в `FILES` и поднять `CACHE_VERSION` в sw.js, `APP_VERSION` в js/version.js.

## Тесты
- Логика: `node --test tests/*.test.mjs`
- Сквозные: `python3 tests/e2e_stage1.py` … `e2e_stage4.py` (нужен Playwright и Chrome)
