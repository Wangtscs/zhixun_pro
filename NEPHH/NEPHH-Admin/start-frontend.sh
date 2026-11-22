#!/usr/bin/env bash
# Start the Vue frontend only. Start the Spring backend with start-backend.sh.
set -euo pipefail
cd -- "$(dirname -- "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5173}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8080}"
EXTRA=()

usage() {
  cat <<'EOF'
Usage: ./start-frontend.sh [--port 5173] [--host 127.0.0.1] [--backend-url http://127.0.0.1:8080]

  --port N         Vite dev server port (default 5173)
  --host HOST      Bind address (default 127.0.0.1)
  --backend-url U  Backend origin for the /api proxy (default http://127.0.0.1:8080)

Examples:
  ./start-frontend.sh
  ./start-frontend.sh --port 5174 --backend-url http://127.0.0.1:8081
EOF
}

while (( $# > 0 )); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --host)
      if (( $# < 2 )); then echo "[error] --host requires a value" >&2; exit 2; fi
      HOST=$2; shift 2 ;;
    --port)
      if (( $# < 2 )); then echo "[error] --port requires a value" >&2; exit 2; fi
      PORT=$2; shift 2 ;;
    --backend-url)
      if (( $# < 2 )); then echo "[error] --backend-url requires a value" >&2; exit 2; fi
      BACKEND_URL=$2; shift 2 ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "[error] Node.js not found. Install Node.js 22.18+ or 24.12+." >&2
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"; then
  echo "[error] Node.js $(node -v) is too old. Vite 8 requires Node.js 20.19+ or 22.12+." >&2
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===22&&b>=18)||(a===24&&b>=12)||a>24?0:1)" >/dev/null 2>&1; then
  echo "[warn] Node.js $(node -v) is below package.json engines (22.18+ or 24.12+); the dev server should still run."
fi

if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  echo "[info] Installing frontend dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

export BACKEND_URL
echo "[info] Frontend: http://$HOST:$PORT/login"
echo "[info] API proxy: $BACKEND_URL"
exec npm run dev -- --host "$HOST" --port "$PORT" --strictPort ${EXTRA[@]+"${EXTRA[@]}"}