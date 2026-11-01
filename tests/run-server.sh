#!/usr/bin/env bash
# Runs the rules and server test suites in the same Node image as production.
# With arguments, only those test files: bash tests/run-server.sh tests/chat.test.mjs
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
# The rules' own modules sit next to them in /app, as in the image (only those that exist: docker would make a folder).
extra=()
for m in wardrobe activities duel; do if [ -f "web/$m.mjs" ]; then extra+=(-v "$(pwd -W 2>/dev/null || pwd)/web/$m.mjs:/app/$m.mjs:ro"); fi; done
docker run --rm -e NODE_NO_WARNINGS=1 -e TZ=Europe/Paris "${extra[@]}" \
  -v "$(pwd -W 2>/dev/null || pwd)/web/rules.mjs:/app/rules.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/server.mjs:/app/server.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/admin.mjs:/app/admin.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/push.mjs:/app/push.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/chat.mjs:/app/chat.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/admin:/w/admin:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/web:/w/web:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/tests:/w/tests:ro" \
  -w /w node:24-alpine node --test --test-reporter=spec "${@:-tests/*.test.mjs}"
