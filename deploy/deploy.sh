#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set DOMAIN/PUBLIC_URL/MONOPAY_TAG." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${PUBLIC_URL:-}" ] || [ -z "${DOMAIN:-}" ]; then
  echo "PUBLIC_URL and DOMAIN are required in .env" >&2
  exit 1
fi

mkdir -p data backups

echo "Pulling ${MONOPAY_IMAGE:-ghcr.io/shanggui/monopay}:${MONOPAY_TAG:-latest}"
docker compose pull

echo "Starting and waiting for health checks"
docker compose up -d --wait

echo "Smoke test: ${PUBLIC_URL}"
./smoke.sh "${PUBLIC_URL}"

echo "Deployment OK"
echo "Health: ${PUBLIC_URL}/readyz"
