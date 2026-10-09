#!/usr/bin/env bash
# SessionStart: sørger for at avhengigheter er installert i Claude Code-skyøkter,
# så typecheck/lint/build fungerer med en gang. Gjør ingenting lokalt.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Installer bare når node_modules mangler eller lockfila er nyere.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1 || npm install --no-audit --no-fund --loglevel=error >/dev/null 2>&1
fi

echo "Familiesamarbeid: avhengigheter klare. Les docs/STATUS.md før du starter."
