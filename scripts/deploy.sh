#!/usr/bin/env bash
# Runs on the VPS via GitHub Actions SSH. Idempotent — safe to re-run.
set -euo pipefail

REPO_DIR="/opt/psyduck-status"
cd "$REPO_DIR"

echo "--> pulling latest"
# Hard-reset to origin/main so a dirty tree can't block the deploy.
git fetch origin main
OLD_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  echo "--> already at $NEW_SHA, nothing to deploy"
  exit 0
fi

# Diff between the two shas so we only restart what actually changed.
CHANGED=$(git diff --name-only "$OLD_SHA" "$NEW_SHA")
echo "--> changed files:"
echo "$CHANGED"

bot_touched=0
card_touched=0
wakapi_touched=0
nginx_touched=0
while IFS= read -r f; do
  case "$f" in
    bot/*) bot_touched=1 ;;
    card-server/*) card_touched=1 ;;
    wakapi/*) wakapi_touched=1 ;;
    nginx/*) nginx_touched=1 ;;
    ecosystem.config.js) bot_touched=1; card_touched=1 ;;
  esac
done <<< "$CHANGED"

if [ "$bot_touched" = "1" ]; then
  echo "--> building bot"
  (cd bot && npm install --no-audit --no-fund && npm run build)
  pm2 reload psyduck-bot --update-env
fi

if [ "$card_touched" = "1" ]; then
  echo "--> building card-server"
  (cd card-server && npm install --no-audit --no-fund && npm run build)
  pm2 reload psyduck-card --update-env
fi

if [ "$nginx_touched" = "1" ]; then
  echo "--> nginx config changed — reload requires manual sudo, skipping"
fi

if [ "$wakapi_touched" = "1" ]; then
  echo "--> wakapi/ changed — config update requires manual sudo, skipping"
fi

pm2 save
echo "--> deployed $NEW_SHA"
