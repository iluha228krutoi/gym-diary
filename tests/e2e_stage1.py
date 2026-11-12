"""Сквозная проверка этапа 1 в настоящем Chrome (мобильный экран).

Запуск: python3 tests/e2e_stage1.py  (сервер поднимается сам)
"""
import http.server
import json
import socketserver
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path("/tmp/shots")
SHOTS.mkdir(exist_ok=True)


def serve():
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


def main():
    srv, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="ru-RU", accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))

        page.goto(url)
        expect(page.locator(".topbar h1")).to_have_text("Тренировка")
        page.get_by_role("link", name="План", exact=True).click()
        expect(page.get_by_text("Плана пока нет")).to_be_visible()
        page.wait_for_load_state("networkidle")
        page.screenshot(path=SHOTS / "01_empty.png", timeout=60000)

        # создание плана с ошибкой ввода
        page.get_by_role("button", name="Создать план").click()
        page.fill("input[name=name]", "Верх/Низ")
        page.fill("input[name=perWeek]", "9")
        page.get_by_role("button", name="Создать план").last.click()
        expect(page.locator(".form .form-error")).to_contain_text("от 1 до 7")
        page.fill("input[name=perWeek]", "3")
        page.screenshot(path=SHOTS / "02_create_sheet.png")
        page.get_by_role("button", name="Создать план").last.click()
        expect(page.locator(".plan-name")).to_have_text("Верх/Низ")

        # тренировки
        for name in ["Верх", "Низ"]:
            page.get_by_role("button", name="Добавить тренировку").click()
            page.fill("input[name=name]", name)
            page.get_by_role("button", name="Добавить", exact=True).click()
            expect(page.locator(".plan-name")).to_have_text(name)
            if name == "Верх":
                for ex, bw, lo, hi in [("Жим лёжа", False, "6", "10"), ("Брусья", True, "8", "15"),
                                       ("Тяга штанги", False, "8", "12")]:
                    page.get_by_role("button", name="Добавить упражнение").click()
                    page.fill("input[name=q]", ex)
                    if bw:
                        page.locator("input[name=bw]").check()
                    page.get_by_role("button", name=f"Создать «{ex}»").click()
                    page.fill("input[name=lo]", lo)
                    page.fill("input[name=hi]", hi)
                    page.get_by_role("button", name="Сохранить").click()
                    expect(page.locator(".ex-name", has_text=ex)).to_be_visible()
                # перемещение: «Тяга» выше
                page.locator(".ex-row").nth(2).get_by_role("button", name="Выше").click()
                expect(page.locator(".ex-name").nth(1)).to_contain_text("Тяга")
                page.screenshot(path=SHOTS / "03_workout.png")
                # изменить диапазон
                page.locator(".ex-main", has_text="Жим лёжа").click()
                page.get_by_role("button", name="Изменить диапазон").click()
                page.fill("input[name=lo]", "12"); page.fill("input[name=hi]", "8")
                page.get_by_role("button", name="Сохранить").click()
                expect(page.locator(".form .form-error")).to_contain_text("больше верхней")
                page.fill("input[name=lo]", "5"); page.fill("input[name=hi]", "8")
                page.get_by_role("button", name="Сохранить").click()
                expect(page.locator(".ex-row", has_text="Жим лёжа")).to_contain_text("5–8")
            else:
                # существующее упражнение находится поиском, дубликат не создаётся
                page.get_by_role("button", name="Добавить упражнение").click()
                page.fill("input[name=q]", "жим")
                expect(page.locator(".pick", has_text="Жим лёжа")).to_be_visible()
                expect(page.get_by_role("button", name="Создать «жим»")).to_be_visible()
                page.fill("input[name=q]", "ЖИМ ЛЁЖА")
                expect(page.locator(".pick.create")).to_have_count(0)
                page.screenshot(path=SHOTS / "04_picker.png")
                page.locator(".pick", has_text="Жим лёжа").click()
                page.fill("input[name=lo]", "8"); page.fill("input[name=hi]", "12")
                page.get_by_role("button", name="Сохранить").click()
            page.get_by_role("link", name="Назад").click()

        expect(page.locator(".workout-card")).to_have_count(2)
        page.screenshot(path=SHOTS / "05_plan.png", full_page=True)

        # данные переживают перезагрузку
        page.reload()
        expect(page.locator(".workout-card")).to_have_count(2)

        # резервная копия: скачать → изменить → восстановить
        page.get_by_role("link", name="Настройки", exact=True).click()
        with page.expect_download() as dl:
            page.get_by_role("button", name="Сохранить копию").click()
        path = dl.value.path()
        backup = json.loads(Path(path).read_text())
        assert backup["format"] == "gym-diary-backup" and len(backup["tables"]["exercises"]) == 3
        page.screenshot(path=SHOTS / "06_settings.png")

        page.get_by_role("link", name="План", exact=True).click()
        page.locator(".workout-card", has_text="Низ").click()
        page.get_by_role("button", name="Удалить тренировку из плана").click()
        page.get_by_role("button", name="Удалить", exact=True).click()
        expect(page.locator(".workout-card")).to_have_count(1)

        page.get_by_role("link", name="Настройки", exact=True).click()
        page.set_input_files("input[type=file]", path)
        expect(page.get_by_text("упражнений 3")).to_be_visible()
        page.get_by_role("button", name="Заменить данные").click()
        expect(page.locator(".workout-card")).to_have_count(2)

        # мусорный файл
        junk = Path("/tmp/junk.json"); junk.write_text('{"hello": 1}')
        page.get_by_role("link", name="Настройки", exact=True).click()
        page.set_input_files("input[type=file]", str(junk))
        expect(page.locator(".toast.error")).to_contain_text("не резервная копия")

        # работа без интернета: service worker закэшировал файлы
        page.goto(url + "#/plan")
        page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
        ctx.set_offline(True)
        page.reload()
        expect(page.locator(".workout-card")).to_have_count(2)
        ctx.set_offline(False)

        browser.close()
    srv.shutdown()
    if errors:
        print("Ошибки в консоли:", *errors, sep="\n  ")
        sys.exit(1)
    print("E2E этап 1: OK")


if __name__ == "__main__":
    main()
