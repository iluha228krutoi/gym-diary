@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
    echo [!] Python не найден. Он уже стоит, если ты запускал бота — проверь, что запускаешь этот файл из папки gymapp.
    pause
    exit /b 1
)
echo Приложение открывается в браузере: http://localhost:8080
echo Чтобы остановить - закрой это окно.
start "" http://localhost:8080/
python -m http.server 8080
