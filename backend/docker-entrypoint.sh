#!/bin/sh
set -e

export DB_HOST="${DB_HOST:-postgres}"
export DB_PORT="${DB_PORT:-5432}"
ATTEMPTS=0

echo "[entrypoint] waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until node -e "
const net = require('net');
const socket = net.connect(Number(process.env.DB_PORT), process.env.DB_HOST);
socket.setTimeout(2000);
socket.on('connect', () => { socket.end(); process.exit(0); });
socket.on('timeout', () => { socket.destroy(); process.exit(1); });
socket.on('error', () => process.exit(1));
" 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 45 ]; then
    echo "[entrypoint] database still unreachable after ${ATTEMPTS} attempts; continuing anyway"
    break
  fi
  sleep 2
done

if [ ! -d "/app/prisma/migrations" ] || [ -z "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] no migrations found; refusing to alter the database with db push" >&2
  exit 1
fi

echo "[entrypoint] applying migrations"
npx prisma migrate deploy || { echo "[entrypoint] migrate deploy failed"; exit 1; }

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] seeding reference data"
  if [ -f "dist/db/seed.js" ]; then
    node dist/db/seed.js || echo "[entrypoint] seed failed (non-fatal)"
  else
    npx tsx src/db/seed.ts || echo "[entrypoint] seed failed (non-fatal)"
  fi
fi

echo "[entrypoint] starting: $*"
exec "$@"
