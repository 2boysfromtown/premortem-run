#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13 or newer is required: https://nodejs.org/" >&2
  exit 1
fi

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || {
  echo "Node.js 22.13 or newer is required." >&2
  exit 1
}

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  echo "pnpm/Corepack is unavailable. Install Node.js 22.13 or newer." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  printf 'Optional OpenAI API key (press Enter for deterministic no-key mode): '
  IFS= read -r -s OPENAI_KEY
  printf '\n'
  if [[ -n "$OPENAI_KEY" ]]; then
    TMP_ENV=".env.tmp.$$"
    while IFS= read -r line || [[ -n "$line" ]]; do
      case "$line" in
        AI_PROVIDER=*) printf '%s\n' 'AI_PROVIDER=openai' >> "$TMP_ENV" ;;
        OPENAI_API_KEY=*|'# OPENAI_API_KEY='*) printf 'OPENAI_API_KEY=%s\n' "$OPENAI_KEY" >> "$TMP_ENV" ;;
        *) printf '%s\n' "$line" >> "$TMP_ENV" ;;
      esac
    done < .env
    if ! grep -q '^OPENAI_API_KEY=' "$TMP_ENV"; then
      printf 'OPENAI_API_KEY=%s\n' "$OPENAI_KEY" >> "$TMP_ENV"
    fi
    mv "$TMP_ENV" .env
    unset OPENAI_KEY
  fi
fi

echo 'Installing verified dependencies...'
"${PNPM[@]}" install --frozen-lockfile
echo 'Installing the local Chromium runtime...'
"${PNPM[@]}" exec playwright install chromium
echo 'Starting PREMORTEM...'
"${PNPM[@]}" start:local
