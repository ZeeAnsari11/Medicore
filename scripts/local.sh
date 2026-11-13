#!/usr/bin/env bash
# Starts MongoDB (replica set rs0) if needed, then the API and web dev servers.
set -e

cd "$(dirname "$0")/.."

MONGOD_CONF="${MONGOD_CONF:-/usr/local/etc/mongod.conf}"

if ! mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
  echo "Starting MongoDB..."
  mongod --config "$MONGOD_CONF" --fork >/dev/null
  until mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; do sleep 1; done
fi

mongosh --quiet --eval 'try { rs.status().ok } catch (e) { rs.initiate().ok }' >/dev/null

echo "Web: http://localhost:3000  |  API: http://localhost:4000/api"
exec pnpm dev
