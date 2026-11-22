#!/usr/bin/env bash
# Start the Spring Boot backend only. Start the Vue frontend with start-frontend.sh.
set -euo pipefail
cd -- "$(dirname -- "$0")"

PORT="${PORT:-8080}"
BUILD=0
EXTRA=()

usage() {
  cat <<'EOF'
Usage: ./start-backend.sh [--port 8080] [--build] [extra Spring Boot args]

  --port N   Listen port (default 8080)
  --build    Rebuild the backend with Maven before starting

Examples:
  ./start-backend.sh
  ./start-backend.sh --port 8081
  ./start-backend.sh --spring.profiles.active=local
EOF
}

while (( $# > 0 )); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --build) BUILD=1; shift ;;
    --port)
      if (( $# < 2 )); then
        echo "[error] --port requires a value" >&2
        exit 2
      fi
      PORT=$2
      shift 2
      ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

JAVA_EXE=""
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
  JAVA_EXE="$JAVA_HOME/bin/java"
else
  JAVA_EXE="$(command -v java || true)"
fi
if [[ -z "$JAVA_EXE" ]]; then
  echo "[error] Java 17+ not found. Install a JDK 17 or newer, or set JAVA_HOME." >&2
  exit 1
fi
if ! "$JAVA_EXE" -version 2>&1 | grep -Eq 'version "(1[7-9]|[2-9][0-9])'; then
  echo "[error] $JAVA_EXE is not Java 17 or newer." >&2
  exit 1
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  detected="$("$JAVA_EXE" -XshowSettings:properties -version 2>&1 |
    awk -F'=' '/java.home =/{v=$2; gsub(/^[ \t\r]+|[ \t\r]+$/, "", v); print v; exit}')"
  if command -v cygpath >/dev/null 2>&1; then
    detected="$(cygpath -u "$detected")"
  fi
  if [[ -n "$detected" ]]; then
    export JAVA_HOME="$detected"
  fi
fi

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) CP_SEP=';' ;;
  *) CP_SEP=':' ;;
esac

LIBS='../.nephh-runtime/lib'
shopt -s nullglob
libs=("$LIBS"/*.jar)
shopt -u nullglob

if (( BUILD == 0 )) && [[ -f target/classes/com/nephh/NephhApplication.class && ${#libs[@]} -gt 0 ]]; then
  echo "[info] Starting backend from target/classes on http://127.0.0.1:$PORT"
  echo "[info] Health: http://127.0.0.1:$PORT/api/health"
  echo "[info] Database: .local-database.yml (MySQL) when present, otherwise local H2."
  exec "$JAVA_EXE" -Dfile.encoding=UTF-8 \
    -cp "src/main/resources${CP_SEP}target/classes${CP_SEP}${LIBS}/*" \
    com.nephh.NephhApplication \
    --server.address=127.0.0.1 --server.port="$PORT" \
    ${EXTRA[@]+"${EXTRA[@]}"}
fi

echo "[info] Building backend with Maven (first run may download dependencies)..."
if [[ -x ./mvnw ]]; then
  ./mvnw -DskipTests package
else
  mvn -DskipTests package
fi

echo "[info] Starting backend jar on http://127.0.0.1:$PORT"
echo "[info] Health: http://127.0.0.1:$PORT/api/health"
exec "$JAVA_EXE" -Dfile.encoding=UTF-8 \
  -jar target/nephh-backend-0.0.1-SNAPSHOT.jar \
  --server.address=127.0.0.1 --server.port="$PORT" \
  ${EXTRA[@]+"${EXTRA[@]}"}