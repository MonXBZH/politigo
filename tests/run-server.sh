#!/usr/bin/env bash
# Runs the rules and server test suites in the same Node image as production.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
docker run --rm -e NODE_NO_WARNINGS=1 -e TZ=Europe/Paris \
  -v "$(pwd -W 2>/dev/null || pwd)/web/rules.mjs:/app/rules.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/server.mjs:/app/server.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/admin.mjs:/app/admin.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/server/push.mjs:/app/push.mjs:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/web:/w/web:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/tests:/w/tests:ro" \
  -w /w node:24-alpine node --test --test-reporter=spec tests/rules.test.mjs tests/rules.extra.test.mjs tests/rules.duel.test.mjs tests/minigames.test.mjs tests/duel.client.test.mjs tests/server.test.mjs tests/server.extra.test.mjs tests/resync.test.mjs tests/version.test.mjs tests/changelog.test.mjs tests/news.test.mjs tests/admin.test.mjs tests/duel.test.mjs tests/push.test.mjs
