#!/usr/bin/env bash
# Shows the link and login of the running `pnpm share:pharmax` (and copies them to the clipboard on macOS).
cd "$(dirname "$0")/.."
if [ -f scripts/pharmax-share.info ]; then
  cat scripts/pharmax-share.info
  command -v pbcopy >/dev/null && pbcopy <scripts/pharmax-share.info && echo "(copied to your clipboard)"
else
  echo "pnpm share:pharmax is not running (or has not finished starting). Run it first."
  exit 1
fi
