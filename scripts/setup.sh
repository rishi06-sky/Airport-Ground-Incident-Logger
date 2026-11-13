#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
python3 --version
npm ci --cache "${npm_config_cache:-$PWD/.data/npm-cache}" --no-audit --no-fund
python3 -m venv .venv
.venv/bin/pip install -r validation-service/requirements.txt
node scripts/init-env.mjs
bash scripts/mongo-local.sh
node --env-file=.env backend/src/seed.js
