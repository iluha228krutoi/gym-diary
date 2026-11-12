"""Проверка переноса из бота: файл от export_to_app.py восстанавливается и работает во всех разделах."""
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from e2e_stage1 import SHOTS, serve  # noqa: E402


def main(backup: str):
    srv, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        page = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                   is_mobile=True, has_touch=True, locale="ru-RU").new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(url + "#/settings")
        page.set_input_files("input[type=file]", backup)
        expect(page.get_by_text("тренировок 4")).to_be_visible()
        page.get_by_role("button", name="Заменить данные").click()

        expect(page.locator(".plan-name")).to_have_text("Верх/Низ")
        expect(page.locator(".term-text")).to_contain_text("21-й день")
        expect(page.locator(".term-text")).to_contain_text("тренировок: 4")
        page.get_by_role("link", name="Рекорды", exact=True).click()
        expect(page.locator(".rec-row")).to_have_count(3)
        expect(page.locator(".rec-row", has_text="Жим лёжа")).to_contain_text("80×7")
        page.get_by_role("link", name="Прогресс", exact=True).click()
        expect(page.locator(".stat-value")).to_have_text("4")
        page.get_by_role("link", name="Тренировка", exact=True).click()
        expect(page.locator(".choose.next")).to_contain_text("Верх")
        page.locator(".choose", has_text="Верх").click()
        expect(page.locator(".set-chip").first).to_have_text("80×7")
        expect(page.locator("#weight")).to_have_value("80")
        page.screenshot(path=SHOTS / "41_after_import.png")
        browser.close()
    srv.shutdown()
    if errors:
        print("Ошибки:", *errors, sep="\n  ")
        sys.exit(1)
    print("Перенос из бота: OK")


if __name__ == "__main__":
    main(sys.argv[1])
