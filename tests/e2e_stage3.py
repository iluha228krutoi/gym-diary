"""Сквозная проверка этапа 3: рекорды при вводе, в сводке и в разделе «Рекорды»."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from e2e_stage1 import SHOTS, serve  # noqa: E402


def history_backup(path: Path):
    """Копия с планом и двумя прошлыми тренировками — восстанавливаем её через настройки."""
    t = "2026-11-01T10:00:00.000Z"
    sets, sid = [], 0
    def add(session, ex, w, r):
        nonlocal sid
        sid += 1
        sets.append({"id": sid, "sessionId": session, "exerciseId": ex, "weight": w, "reps": r, "createdAt": t})
    for w, r in [(80, 10), (80, 8)]: add(1, 1, w, r)
    add(1, 2, 0, 12)
    for w, r in [(85, 8), (90, 5)]: add(2, 1, w, r)
    add(2, 2, 0, 14); add(2, 2, 5, 8)
    backup = {
        "format": "gym-diary-backup", "formatVersion": 1, "schemaVersion": 1, "exportedAt": t,
        "meta": {"lastBackupAt": "2099-01-01T00:00:00.000Z"},
        "tables": {
            "plans": [{"id": 1, "name": "Верх/Низ", "workoutsPerWeek": 3, "durationWeeks": 8,
                       "startDate": "2026-10-20", "isActive": True, "archivedAt": None}],
            "workouts": [{"id": 1, "planId": 1, "name": "Верх", "position": 1, "isDeleted": False}],
            "exercises": [{"id": 1, "name": "Жим лёжа", "isBodyweight": False, "createdAt": t},
                          {"id": 2, "name": "Брусья", "isBodyweight": True, "createdAt": t}],
            "planExercises": [{"id": 1, "workoutId": 1, "exerciseId": 1, "position": 1, "repMin": 6, "repMax": 10},
                              {"id": 2, "workoutId": 1, "exerciseId": 2, "position": 2, "repMin": 8, "repMax": 15}],
            "sessions": [{"id": 1, "workoutId": 1, "date": "2026-10-28", "startedAt": t, "finishedAt": t,
                          "autoFinished": False, "currentExerciseId": None},
                         {"id": 2, "workoutId": 1, "date": "2026-11-01", "startedAt": t, "finishedAt": t,
                          "autoFinished": False, "currentExerciseId": None}],
            "sets": sets,
        },
    }
    path.write_text(json.dumps(backup, ensure_ascii=False))


def add_set(page, weight, reps):
    page.fill("#weight", str(weight))
    page.fill("#reps", str(reps))
    page.get_by_role("button", name="Записать подход").click()


def main():
    srv, url = serve()
    errors = []
    backup = Path("/tmp/history_backup.json")
    history_backup(backup)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="ru-RU")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(url + "#/records")
        expect(page.get_by_text("Рекордов пока нет")).to_be_visible()

        page.get_by_role("link", name="Настройки", exact=True).click()
        page.set_input_files("input[type=file]", str(backup))
        page.get_by_role("button", name="Заменить данные").click()

        # раздел «Рекорды»
        page.get_by_role("link", name="Рекорды", exact=True).click()
        expect(page.locator(".rec-row")).to_have_count(2)
        expect(page.locator(".rec-row", has_text="Жим лёжа")).to_contain_text("85×8")
        expect(page.locator(".rec-row", has_text="Брусья")).to_contain_text("+5×8")
        page.screenshot(path=SHOTS / "21_records.png")
        page.locator(".rec-row", has_text="Жим лёжа").click()
        rows = page.locator(".rec-table tbody tr")
        expect(rows).to_have_count(3)
        expect(rows.nth(0)).to_contain_text("90 кг")   # 5 повторов
        page.screenshot(path=SHOTS / "22_record_table.png")

        # тренировка с рекордами
        page.get_by_role("link", name="Тренировка", exact=True).click()
        page.locator(".choose", has_text="Верх").click()
        add_set(page, 80, 8)
        expect(page.locator(".record-card")).to_have_count(0)
        add_set(page, 87.5, 8)
        expect(page.locator(".record-card")).to_contain_text("лучший подход 87.5×8 (был 85×8)")
        page.screenshot(path=SHOTS / "23_live_record.png", full_page=True)
        add_set(page, 87.5, 7)
        expect(page.locator(".record-card")).to_have_count(0)   # показывается один раз
        page.get_by_role("button", name="Дальше").click()
        add_set(page, 0, 15)
        expect(page.locator(".record-card")).to_contain_text("рекорд повторов: свой вес")

        page.get_by_role("button", name="Завершить", exact=True).click()
        page.locator("dialog").get_by_role("button", name="Завершить", exact=True).click()
        card = page.locator(".record-card")
        expect(card).to_contain_text("Рекорды за тренировку")
        expect(card).to_contain_text("Жим лёжа")
        expect(card).to_contain_text("Брусья")
        page.screenshot(path=SHOTS / "24_summary_records.png")

        page.get_by_role("link", name="Рекорды", exact=True).click()
        expect(page.locator(".rec-row", has_text="Жим лёжа")).to_contain_text("87.5×8")

        browser.close()
    srv.shutdown()
    if errors:
        print("Ошибки в консоли:", *errors, sep="\n  ")
        sys.exit(1)
    print("E2E этап 3: OK")


if __name__ == "__main__":
    main()
