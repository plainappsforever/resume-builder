#!/usr/bin/env bash
# Restarts THIS app's Metro (port 8166) after files were added (the file watcher misses new files on this Mac).
# Stops only the process LISTENING on our port and the npx parent recorded in artifacts/metro.pid.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
for pid in $(lsof -ti "tcp:$METRO_PORT" -sTCP:LISTEN || true); do kill "$pid"; done
[[ -f artifacts/metro.pid ]] && kill "$(cat artifacts/metro.pid)" 2>/dev/null || true
sleep 2
mkdir -p artifacts
(CI=1 nohup npx expo start --dev-client --port "$METRO_PORT" >artifacts/metro.log 2>&1 &
 echo $! >artifacts/metro.pid)
for _ in $(seq 1 30); do
  node -e 'fetch("http://localhost:"+process.argv[1]+"/status").then((r)=>r.text()).then((t)=>process.exit(t.includes("running")?0:1)).catch(()=>process.exit(1))' "$METRO_PORT" && { echo "Metro up on $METRO_PORT"; exit 0; }
  sleep 1
done
echo "Metro did not start" >&2; exit 1
