#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-${PUBLIC_URL:-}}"
if [ -z "$BASE" ]; then
  echo "Usage: ./smoke.sh https://monopay.example.com" >&2
  exit 1
fi

echo "== healthz =="
curl -fsS "$BASE/healthz" | head -c 500
echo
echo "== readyz =="
curl -fsS "$BASE/readyz" | head -c 500
echo

echo "== home =="
HOME_CODE=$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/")
echo "HTTP $HOME_CODE"
[ "$HOME_CODE" = "200" ]

echo "== security headers =="
HEADERS=$(curl -fsSI "$BASE/")
echo "$HEADERS" | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options|x-frame-options' || {
  echo "Missing expected security headers" >&2
  exit 1
}

echo "== create room =="
ROOM=$(curl -fsS -X POST "$BASE/api/rooms" \
  -H 'content-type: application/json' \
  -d '{"hostIdentity":"dual","initialFunds":2000,"maxPlayers":2,"hostNickname":"smoke"}')
ROOM_CODE=$(printf '%s' "$ROOM" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.roomCode))')
[ -n "$ROOM_CODE" ]
echo "created room $ROOM_CODE"

echo "== join room =="
JOINED=$(curl -fsS -X POST "$BASE/api/rooms/$ROOM_CODE/join" \
  -H 'content-type: application/json' \
  -d '{"nickname":"smoke-player"}')
echo "$JOINED" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).data;console.log("joined player", d.playerId)})'

echo "Smoke test OK: room $ROOM_CODE"
