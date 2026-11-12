"""Сквозная проверка этапа 2: тренировка, отсчёт плана, удаление плана и упражнений."""
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from e2e_stage1 import SHOTS, serve  # noqa: E402


def add_exercise(page, name, lo, hi, bw=False):
    page.get_by_role("button", name="Добавить упражнение").click()
    page.fill("input[name=q]", name)
    if bw:
        page.locator("input[name=bw]").check()
    page.get_by_role("button", name=f"Создать «{name}»").click()
    page.fill("input[name=lo]", lo)
    page.fill("input[name=hi]", hi)
    page.get_by_role("button", name="Сохранить").click()
    expect(page.locator(".ex-name", has_text=name)).to_be_visible()


def add_set(page, weight, reps):
    if weight is not None:
        page.fill("#weight", str(weight))
    page.fill("#reps", str(reps))
    page.get_by_role("button", name="Записать подход").click()


def main():
    srv, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="ru-RU")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(url)

        # пустое состояние тренировки
        expect(page.get_by_text("Сначала составь план")).to_be_visible()

        # тестовый план → удаление полностью
        page.get_by_role("link", name="План", exact=True).click()
        page.get_by_role("button", name="Создать план").click()
        page.fill("input[name=name]", "Тестовый")
        page.get_by_role("button", name="Создать план").last.click()
        page.get_by_role("button", name="Удалить план").click()
        expect(page.get_by_text("и его тренировки будут удалены")).to_be_visible()
        page.get_by_role("button", name="Удалить план").last.click()
        expect(page.get_by_text("Плана пока нет")).to_be_visible()

        # рабочий план
        page.get_by_role("button", name="Создать план").click()
        page.fill("input[name=name]", "Верх/Низ")
        page.get_by_role("button", name="Создать план").last.click()
        expect(page.get_by_text("План ещё не начат")).to_be_visible()
        for wname, exs in [("Верх", [("Жим лёжа", "6", "10", False), ("Брусья", "8", "15", True)]),
                           ("Низ", [("Присед", "6", "10", False)])]:
            page.get_by_role("button", name="Добавить тренировку").click()
            page.fill("input[name=name]", wname)
            page.get_by_role("button", name="Добавить", exact=True).click()
            for name, lo, hi, bw in exs:
                add_exercise(page, name, lo, hi, bw)
            page.get_by_role("link", name="Назад").click()

        # тренировка: выбор, следующая по очереди
        page.get_by_role("link", name="Тренировка", exact=True).click()
        expect(page.locator(".choose.next")).to_contain_text("Верх")
        page.screenshot(path=SHOTS / "11_choose.png")
        page.locator(".choose", has_text="Верх").click()
        expect(page.locator(".ex-title")).to_have_text("Жим лёжа")
        expect(page.get_by_text("ещё не делал")).to_be_visible()

        add_set(page, 80, "")
        expect(page.locator(".entry .form-error")).to_contain_text("Повторы")
        add_set(page, 80, 10)
        # вес остался в поле, повторы — через кнопки
        expect(page.locator("#weight")).to_have_value("80")
        page.get_by_role("button", name="Плюс 1").click()
        expect(page.locator("#reps")).to_have_value("6")       # пусто → нижняя граница диапазона
        page.fill("#reps", "10")
        page.get_by_role("button", name="Записать подход").click()
        add_set(page, 80, 9)
        expect(page.locator(".today-sets li")).to_have_count(3)
        page.get_by_role("button", name="Удалить последний подход").click()
        expect(page.locator(".today-sets li")).to_have_count(2)
        page.screenshot(path=SHOTS / "12_exercise.png", full_page=True)

        page.get_by_role("button", name="Дальше").click()
        expect(page.locator(".ex-title")).to_have_text("Брусья")
        expect(page.get_by_text("Доп. вес, кг")).to_be_visible()
        add_set(page, 0, 12)

        # упражнение не по плану: новое
        page.get_by_role("button", name="Не по плану").click()
        page.fill("input[name=q]", "Шраги")
        page.get_by_role("button", name="Создать «Шраги»").click()
        expect(page.locator(".ex-title")).to_have_text("Шраги")
        expect(page.locator(".ex-title-row .tag")).to_have_text("не по плану")
        add_set(page, 40, 12)

        # данные переживают перезагрузку посреди тренировки
        page.reload()
        expect(page.locator(".ex-title")).to_have_text("Шраги")
        page.get_by_role("button", name="Все упражнения").click()
        expect(page.locator(".done-mark.on")).to_have_count(3)
        page.screenshot(path=SHOTS / "13_list.png")
        page.get_by_role("button", name="Завершить тренировку").click()
        page.locator("dialog").get_by_role("button", name="Завершить", exact=True).click()
        expect(page.get_by_text("Тренировка завершена")).to_be_visible()
        expect(page.locator(".summary-list li")).to_have_count(3)
        page.screenshot(path=SHOTS / "14_done.png")

        # план начался, очередь сдвинулась
        page.get_by_role("link", name="План", exact=True).click()
        expect(page.locator(".term-text")).to_contain_text("1-й день")
        page.get_by_role("link", name="Тренировка", exact=True).click()
        expect(page.locator(".choose.next")).to_contain_text("Низ")

        # вторая «Верх»: подсказка о весе, подставленный вес
        page.locator(".choose", has_text="Верх").click()
        expect(page.locator(".set-chip")).to_have_count(2)
        expect(page.locator(".hint-up")).to_contain_text("пора увеличить вес")
        expect(page.locator("#weight")).to_have_value("80")

        # автозавершение: делаем открытую тренировку «вчерашней»
        add_set(page, 82.5, 8)
        page.evaluate("""() => new Promise((res, rej) => {
            const r = indexedDB.open('gymapp');
            r.onsuccess = () => {
              const db = r.result, tx = db.transaction('sessions', 'readwrite'), st = tx.objectStore('sessions');
              st.getAll().onsuccess = (e) => {
                for (const s of e.target.result) if (!s.finishedAt) { s.date = '2020-01-01'; st.put(s); }
              };
              tx.oncomplete = () => { db.close(); res(); };
              tx.onerror = () => rej(tx.error);
            };
        })""")
        page.reload()
        expect(page.get_by_text("Тренировка завершена автоматически")).to_be_visible()
        page.screenshot(path=SHOTS / "15_auto.png")
        page.get_by_role("button", name="Понятно").click()
        expect(page.locator(".choose").first).to_be_visible()

        # пустая тренировка не сохраняется
        page.locator(".choose", has_text="Низ").click()
        page.get_by_role("button", name="Завершить", exact=True).click()
        expect(page.get_by_text("не сохранится")).to_be_visible()
        page.locator("dialog").get_by_role("button", name="Завершить", exact=True).click()
        expect(page.get_by_text("подходов не было")).to_be_visible()

        # справочник: переименование и удаление
        page.get_by_role("link", name="План", exact=True).click()
        page.get_by_role("link", name="Все упражнения").click()
        expect(page.locator(".ex-row", has_text="Жим лёжа")).to_contain_text("в плане: Верх")
        page.screenshot(path=SHOTS / "16_exercises.png")
        page.locator(".ex-main", has_text="Шраги").click()
        page.get_by_role("button", name="Переименовать").click()
        page.fill("input[name=name]", "брусья")
        page.get_by_role("button", name="Сохранить").click()
        expect(page.locator(".form .form-error")).to_contain_text("уже есть")
        page.fill("input[name=name]", "Шраги с гантелями")
        page.get_by_role("button", name="Сохранить").click()
        expect(page.locator(".ex-name", has_text="Шраги с гантелями")).to_be_visible()
        page.locator(".ex-main", has_text="Шраги с гантелями").click()
        page.get_by_role("button", name="Удалить упражнение").click()
        expect(page.get_by_text("Удалятся 1 подход")).to_be_visible()
        page.get_by_role("button", name="Удалить", exact=True).click()
        expect(page.locator(".ex-name", has_text="Шраги")).to_have_count(0)

        # удаление плана с историей
        page.get_by_role("link", name="Назад").click()
        page.get_by_role("button", name="Удалить план").click()
        expect(page.get_by_text("История тренировок и рекорды сохранятся")).to_be_visible()

        browser.close()
    srv.shutdown()
    if errors:
        print("Ошибки в консоли:", *errors, sep="\n  ")
        sys.exit(1)
    print("E2E этап 2: OK")


if __name__ == "__main__":
    main()
