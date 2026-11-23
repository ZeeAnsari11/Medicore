#!/usr/bin/env bash
# Shares the fresh PharmaX Distribution instance through two Cloudflare quick tunnels, separately from `pnpm share`.
# It runs its own API (4100) and web (3100) on the medicore_pharmax database, so your demo data and the servers
# from `pnpm local` / `pnpm share` are untouched. Nothing in .env files is edited: everything is passed as env vars.
# It builds production versions of the API and web app first (about 1-2 minutes), then serves them.
# Ctrl+C stops the servers and both tunnels. Run:  pnpm share:pharmax
set -e

cd "$(dirname "$0")/.."

CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")}"
[ -x "$CLOUDFLARED" ] || { echo "cloudflared not found. Put it on PATH or in ~/.local/bin, or set CLOUDFLARED=/path."; exit 1; }

WEB_PORT=3100
API_PORT=4100
MONGO_URI="${PHARMAX_MONGO_URI:-mongodb://127.0.0.1:27017/medicore_pharmax?replicaSet=rs0}"
MONGOD_CONF="${MONGOD_CONF:-/usr/local/etc/mongod.conf}"
LOG_DIR="$(mktemp -d)"

# A stale server on one of these ports would make the share look up while login fails, so stop early instead.
for port in "$WEB_PORT" "$API_PORT"; do
  pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
  if [ -n "$pids" ]; then
    echo "Port $port is already in use by pid(s): $pids" >&2
    ps -o pid=,command= -p ${pids} 2>/dev/null | cut -c1-140 >&2
    echo "Stop that process (kill $pids), then run this again." >&2
    exit 1
  fi
done

if ! mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
  echo "Starting MongoDB..."
  mongod --config "$MONGOD_CONF" --fork >/dev/null
  until mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; do sleep 1; done
fi
mongosh --quiet --eval 'try { rs.status().ok } catch (e) { rs.initiate().ok }' >/dev/null

PIDS=()
INFO_FILE=scripts/pharmax-share.info
cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; rm -f "$INFO_FILE"; }
trap cleanup EXIT INT TERM

# Quick tunnels sometimes fail to register on the first try, so retry a few times. Sets TUNNEL_URL
# (not run in a subshell, so the tunnel's pid reaches cleanup).
# cloudflared's own request for a quick tunnel times out on networks where IPv4 to api.trycloudflare.com is
# slow, so the tunnel is requested here with curl over IPv6 and cloudflared is then run with those credentials
# over http2 (UDP/QUIC is blocked on some networks).
start_tunnel() { # <name> <port>
  TUNNEL_URL=""
  for attempt in 1 2 3; do
    echo "Starting $1 tunnel (attempt $attempt)..."
    curl -6 -s -m 45 -X POST https://api.trycloudflare.com/tunnel -H 'content-type: application/json' -d '{}' \
      -o "$LOG_DIR/$1-quick.json" || true
    node -e '
      const fs = require("fs");
      const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).result;
      fs.writeFileSync(process.argv[2], JSON.stringify({ AccountTag: r.account_tag, TunnelSecret: r.secret, TunnelID: r.id }));
      console.log(r.hostname + " " + r.id);
    ' "$LOG_DIR/$1-quick.json" "$LOG_DIR/$1-cred.json" >"$LOG_DIR/$1-host.txt" 2>/dev/null || continue
    read -r host id <"$LOG_DIR/$1-host.txt"
    "$CLOUDFLARED" tunnel --no-autoupdate --protocol http2 --credentials-file "$LOG_DIR/$1-cred.json" \
      --url "http://localhost:$2" run "$id" >"$LOG_DIR/$1.log" 2>&1 &
    local pid=$!
    for _ in $(seq 1 30); do
      if grep -q 'Registered tunnel connection' "$LOG_DIR/$1.log"; then
        TUNNEL_URL="https://$host"; PIDS+=($pid); return
      fi
      sleep 1
    done
    kill "$pid" 2>/dev/null || true
  done

  # Fallback for networks where Cloudflare's API is unreachable: an SSH tunnel through localhost.run (no install,
  # but a third party relays the traffic and the URL changes on every run).
  echo "Cloudflare tunnel unavailable; falling back to localhost.run for the $1 tunnel (traffic is relayed by a third party)."
  for attempt in 1 2 3; do
    echo "Starting $1 tunnel via localhost.run (attempt $attempt)..."
    ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
      -R "80:localhost:$2" nokey@localhost.run >"$LOG_DIR/$1-ssh.log" 2>&1 &
    local pid=$!
    for _ in $(seq 1 25); do
      TUNNEL_URL="$(grep -o 'https://[a-z0-9.]*\.lhr\.life' "$LOG_DIR/$1-ssh.log" | head -1)"
      [ -n "$TUNNEL_URL" ] && { PIDS+=($pid); return; }
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill "$pid" 2>/dev/null || true
  done
  echo "Could not start the $1 tunnel. Last log lines:" >&2
  tail -3 "$LOG_DIR/$1.log" "$LOG_DIR/$1-ssh.log" >&2
  exit 1
}

start_tunnel web "$WEB_PORT"; WEB_URL="$TUNNEL_URL"
start_tunnel api "$API_PORT"; API_URL="$TUNNEL_URL"

caffeinate -dimsu -w $$ &

# Production builds (far faster over a tunnel than the dev servers). The API is compiled into its own folder so
# `pnpm local`'s apps/api/dist is never touched, and the web app is built after the tunnels exist because
# NEXT_PUBLIC_API_URL is inlined at build time.
echo "Compiling the API..."
(cd apps/api && rm -rf dist-pharmax && pnpm exec tsc -p tsconfig.build.json --outDir dist-pharmax)

echo "Building the web app (about a minute)..."
NEXT_DIST_DIR=.next-pharmax NEXT_PUBLIC_API_URL="$API_URL/api" pnpm --filter @medicore/web exec next build >"$LOG_DIR/web-build.log" 2>&1 \
  || { echo "Web build failed:" >&2; tail -30 "$LOG_DIR/web-build.log" >&2; exit 1; }

(cd apps/api && exec env PORT=$API_PORT MONGO_URI="$MONGO_URI" CLIENT_URL="$WEB_URL,http://localhost:$WEB_PORT" node dist-pharmax/main) &
PIDS+=($!)

(cd apps/web && exec env NEXT_DIST_DIR=.next-pharmax ./node_modules/.bin/next start -p "$WEB_PORT") &
PIDS+=($!)

for port in "$API_PORT" "$WEB_PORT"; do
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 1; done
done

{
  echo "Share this link:  $WEB_URL"
  if [ -f scripts/pharmax-login.local ]; then
    # shellcheck disable=SC1091
    . scripts/pharmax-login.local
    echo "Organization:     $ORGANIZATION"
    echo "Username:         $USERNAME"
    echo "Password:         $PASSWORD"
  else
    echo "Login:            organization pharmax-distribution-eh4t / hafiz.shafiq (password: see scripts/pharmax-login.local)"
  fi
} >"$INFO_FILE"
chmod 600 "$INFO_FILE"
command -v pbcopy >/dev/null && pbcopy <"$INFO_FILE" && COPIED=" (copied to your clipboard)"

echo
cat "$INFO_FILE"
echo
echo "Details saved${COPIED}. To see them again any time, in another terminal run:  pnpm share:pharmax:info"
echo "Keep this terminal open. Press Ctrl+C to stop sharing."
echo

wait
