#!/usr/bin/env bash
# Shares the local app through two free Cloudflare quick tunnels so someone on another network can test it.
# Starts the tunnels, writes their URLs into the local (gitignored) env files, then runs the app in the
# foreground. Ctrl+C stops the app and both tunnels. Run:  pnpm share
set -e

cd "$(dirname "$0")/.."

CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")}"
[ -x "$CLOUDFLARED" ] || { echo "cloudflared not found. Put it on PATH or in ~/.local/bin, or set CLOUDFLARED=/path."; exit 1; }

API_ENV=apps/api/.env
WEB_ENV=apps/web/.env.local
LOG_DIR="$(mktemp -d)"

# Never expose the main dev database by accident: sharing must use the demo database.
DB_NAME="$(grep '^MONGO_URI=' "$API_ENV" | sed -E 's#^MONGO_URI=[^/]*//[^/]*/([^?]*).*#\1#')"
echo "API database: $DB_NAME"
if [ "$DB_NAME" = "medicore_dev" ] && [ "$ALLOW_DEV_DB" != "1" ]; then
  echo "Refusing to share medicore_dev (your working data). Point MONGO_URI in $API_ENV at medicore_share, or run with ALLOW_DEV_DB=1."
  exit 1
fi

PIDS=()
cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

start_tunnel() { # <name> <port>
  "$CLOUDFLARED" tunnel --no-autoupdate --url "http://localhost:$2" >"$LOG_DIR/$1.log" 2>&1 &
  PIDS+=($!)
}
tunnel_url() { # <name>
  for _ in $(seq 1 40); do
    url="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/$1.log" | head -1)"
    [ -n "$url" ] && { echo "$url"; return; }
    sleep 1
  done
  echo "Timed out waiting for the $1 tunnel URL (see $LOG_DIR/$1.log)" >&2
  exit 1
}

start_tunnel web 3000
start_tunnel api 4000
WEB_URL="$(tunnel_url web)"
API_URL="$(tunnel_url api)"

# Replace (or add) one KEY=value line in an env file.
set_env() { # <file> <key> <value>
  touch "$1"
  grep -v "^$2=" "$1" >"$1.tmp" || true
  printf '%s=%s\n' "$2" "$3" >>"$1.tmp"
  mv "$1.tmp" "$1"
}
set_env "$WEB_ENV" NEXT_PUBLIC_API_URL "$API_URL/api"
set_env "$API_ENV" CLIENT_URL "$WEB_URL,http://localhost:3000"

# Keep the Mac awake for as long as this script runs.
caffeinate -dimsu -w $$ &

echo
echo "Share this link:  $WEB_URL"
echo "Login:            organization demo / demo.admin / Demo@12345"
echo "Keep this terminal open. Press Ctrl+C to stop sharing."
echo

bash scripts/local.sh
