#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tech2high}"
REPO_URL="${REPO_URL:-https://github.com/vinothsivaperumal/tech2high.git}"
BRANCH="${BRANCH:-main}"
RUN_SCHEMA_SYNC="${RUN_SCHEMA_SYNC:-false}"
SKIP_GIT="${SKIP_GIT:-false}"

mkdir -p "$APP_DIR"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env"
  echo "Copy .env.example to .env and fill production values before deploying."
  exit 1
fi

if [ "$SKIP_GIT" != "true" ]; then
  if [ ! -d "$APP_DIR/.git" ]; then
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi

  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

npm ci
npm run build

if [ "$RUN_SCHEMA_SYNC" = "true" ]; then
  npm run deploy:sql:manual
fi

pm2 startOrReload deploy/pm2/ecosystem.config.cjs --update-env
pm2 save

echo "Checking API health"
curl --fail --silent http://127.0.0.1:4000/health
echo
echo "Checking web response"
curl --silent --head http://127.0.0.1:3000 | head -n 1
echo "Deployment complete"