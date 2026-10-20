@echo off
rem 剛体消失 — ローカルサーバを起動してブラウザで開く
cd /d "%~dp0"
start "" http://127.0.0.1:8765/index.html
python -m http.server 8765 --bind 127.0.0.1
