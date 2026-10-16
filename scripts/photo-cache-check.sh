#!/usr/bin/env bash
# v1.1 F2 (REVIEW_V1 #2): proves on OUR simulator/emulator that no copy of a picked photo stays in the app's files.
# Precondition: dev build installed, Metro on 8166, a photo in the device library (iOS: `xcrun simctl addmedia`,
# Android: pushed to /sdcard/Pictures + media scan) that the picker shows first.
# Steps: import through the SYSTEM picker → list caches; Remove photo → list; import again → Delete all data → list.
# Usage: scripts/photo-cache-check.sh <ios|android> <pickX%> <pickY%>    Writes artifacts/photo-cache-<platform>.txt
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
platform=${1:?Usage: photo-cache-check.sh <ios|android> <pickX%> <pickY%>}
px=${2:?pick x}; py=${3:?pick y}
APP=com.tim.resumebuilder.dev
UDID=3C8B1EEC-4DB4-4AFD-9E9D-467E128935F6 # ResumeBuilder iPhone (D11)
out="artifacts/photo-cache-$platform.txt"
: >"$out"
list() {
  echo "== $1" >>"$out"
  if [[ $platform == ios ]]; then
    c=$(xcrun simctl get_app_container "$UDID" "$APP" data)
    (cd "$c" && find Library/Caches Documents/photos tmp -type f 2>/dev/null | grep -v -E '/(com\.apple|fsCachedData|WebKit|\.com\.apple)' | while read -r f; do echo "  $(stat -f %z "$f") $f"; done) >>"$out" || true
  else
    adb -s "$ANDROID_SERIAL" shell run-as "$APP" find cache files/photos -type f -exec ls -l {} + 2>/dev/null \
      | grep -v -E 'WebView|org.chromium|journal' | awk '{ print "  " $5 " " $NF }' >>"$out" || true
  fi
}
list "before"
# Maestro passes shell variables named MAESTRO_* to the flows.
flow_pick() { scripts/e2e.sh "$platform" development .maestro/manual/photo-picker-open.yaml | tail -2; }
export MAESTRO_PICK_X="$px%" MAESTRO_PICK_Y="$py%"
flow_pick
list "after import through the system picker"
scripts/e2e.sh "$platform" development .maestro/manual/photo-remove.yaml | tail -1
list "after Remove photo"
flow_pick
list "after a second import"
scripts/e2e.sh "$platform" development .maestro/manual/delete-all-now.yaml | tail -1
list "after Delete all data"
cat "$out"
