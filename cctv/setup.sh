#!/usr/bin/env bash
# MomayBUU CCTV Relay - setup (Linux / macOS / Raspberry Pi)
set -e
cd "$(dirname "$0")"
echo "============================================"
echo "  MomayBUU CCTV Relay - setup"
echo "============================================"

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "[ERROR] ไม่พบ Python 3.9+ — ติดตั้งก่อน"; exit 1; }

[ -d .venv ] || { echo "[1/3] สร้าง virtualenv..."; "$PY" -m venv .venv; }

echo "[2/3] ติดตั้ง dependencies..."
. .venv/bin/activate
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements-relay.txt

echo "[3/3] เปิด Control Panel (http://127.0.0.1:8090)..."
python panel.py
