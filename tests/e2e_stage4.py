"""Сквозная проверка этапа 4: раздел «Прогресс» с графиками."""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from e2e_stage1 import SHOTS, serve  # noqa: E402

# (дней назад, подходы жима, подходы брусьев)
HISTORY = [
    (65, [(70, 8)], [(0, 10)]),
    (58, [(72.5, 8), (72.5, 8)], [(0, 11)]),
    (52, [(75, 6)], [(0, 12)]),
    (40, [(75, 8), (75, 7)], [(0, 12)]),
    (33, [(80, 6), (77.5, 8)], [(0, 14)]),
    (12, [(72.5, 8), (70, 8)], [(0, 11)]),
    (9, [(75, 8)], [(0, 12)]),
    (2, [(80, 7), (77.5, 8)], [(5, 8)]),
]


def make_backup(path: Path):
    t = "2026-11-01T10:00:00.000Z"
    today = date.today()
    sessions, sets = [], []
    for i, (ago, bench, dips) in enumerate(HISTORY, 1):
        sessions.append({"id": i, "workoutId": 1, "date": (today - timedelta(days=ago)).isoformat(),
                         "startedAt": t, "finishedAt": t, "autoFinished": False, "currentExerciseId": None})
        for ex, rows in ((1, bench), (2, dips)):
            for w, r in rows:
                sets.append({"id": len(sets) + 1, "sessionId": i, "exerciseId": ex, "weight": w, "reps": r, "createdAt": t})
    path.write_text(json.dumps({
        "format": "gym-diary-backup", "formatVersion": 1, "schemaVersion": 1, "exportedAt": t,
        "meta": {"lastBackupAt": "2099-01-01T00:00:00.000Z"},
        "tables": {
            "plans": [{"id": 1, "name": "Верх/Низ", "workoutsPerWeek": 3, "durationWeeks": 12,
                       "startDate": "2026-08-01", "isActive": True, "archivedAt": None}],
            "workouts": [{"id": 1, "planId": 1, "name": "Верх", "position": 1, "isDeleted": False}],
            "exercises": [{"id": 1, "name": "Жим лёжа", "isBodyweight": False, "createdAt": t},
                          {"id": 2, "name": "Брусья", "isBodyweight": True, "createdAt": t}],
            "planExercises": [{"id": 1, "workoutId": 1, "exerciseId": 1, "position": 1, "repMin": 6, "repMax": 10},
                              {"id": 2, "workoutId": 1, "exerciseId": 2, "position": 2, "repMin": 8, "repMax": 15}],
            "sessions": sessions, "sets": sets,
        },
    }, ensure_ascii=False))


def main():
    srv, url = serve()
    errors = []
    backup = Path("/tmp/progress_backup.json")
    make_backup(backup)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, locale="ru-RU")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(url + "#/progress")
        expect(page.get_by_text("тренировок с подходами нет")).to_be_visible()

        page.get_by_role("link", name="Настройки", exact=True).click()
        page.set_input_files("input[type=file]", str(backup))
        page.get_by_role("button", name="Заменить данные").click()
        page.wait_for_timeout(3000)  # дождаться, пока уйдёт уведомление о восстановлении

        page.get_by_role("link", name="Прогресс", exact=True).click()
        expect(page.locator(".stat-value")).to_have_text("3")
        expect(page.locator(".stat-label")).to_contain_text("из ~13 по плану")
        expect(page.locator(".prog-row", has_text="Жим лёжа")).to_contain_text("72.5×8 → 80×7")
        expect(page.locator(".prog-row", has_text="Жим лёжа").locator(".pct")).to_have_text("+7,4%")
        page.screenshot(path=SHOTS / "31_progress_1m.png", full_page=True)

        page.get_by_role("tab", name="2 месяца").click()
        expect(page.locator(".stat-value")).to_have_text("7")
        expect(page.locator(".breaks li")).to_have_count(2)
        page.screenshot(path=SHOTS / "32_progress_2m.png", full_page=True)

        page.locator(".prog-row", has_text="Жим лёжа").click()
        expect(page.locator(".of-pr-value")).to_have_text("100%")
        expect(page.locator(".chart .dot")).to_have_count(7)
        expect(page.locator(".chart .pr-line")).to_have_count(1)
        expect(page.locator(".chart-readout")).to_contain_text("80×7")
        page.locator(".chart .hit").first.click()
        expect(page.locator(".chart-readout")).to_contain_text("72.5×8")
        page.screenshot(path=SHOTS / "33_progress_bench.png", full_page=True)

        page.get_by_role("tab", name="1 месяц").click()
        expect(page.locator(".chart .dot")).to_have_count(3)

        page.get_by_role("link", name="Назад").click()
        page.locator(".prog-row", has_text="Брусья").click()
        expect(page.locator(".chart .pr-line")).to_have_count(0)
        expect(page.locator(".chart .point-label", has_text="+5×8")).to_have_count(1)
        page.screenshot(path=SHOTS / "34_progress_dips.png", full_page=True)

        browser.close()
    srv.shutdown()
    if errors:
        print("Ошибки в консоли:", *errors, sep="\n  ")
        sys.exit(1)
    print("E2E этап 4: OK")


if __name__ == "__main__":
    main()
