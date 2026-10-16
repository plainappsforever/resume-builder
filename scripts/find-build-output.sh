#!/usr/bin/env bash
# Prints the newest Gradle output of the app module that was written after <epoch-seconds>: in android/app/build/outputs/,
# or under the external build root the owner's Gradle init script uses (~/.gradle/init.d/build-dir-on-ssd.gradle:
# /Volumes/Zweite/claude/gradle-build/<root project name>/app/outputs/). Prints nothing when there is none.
# Usage: scripts/find-build-output.sh <path below outputs/, e.g. apk/release/app-release.apk> <epoch-seconds>
set -euo pipefail
cd "$(dirname "$0")/.."
rel=${1:?path below outputs/}; since=${2:-0}
best=""; best_t=0
# Only THIS app's root projects ("Resume Builder", "… Dev", "… Preview"): never another app's output on the shared SSD.
for f in "android/app/build/outputs/$rel" "/Volumes/Zweite/claude/gradle-build/Resume Builder"*/app/outputs/"$rel"; do
  [[ -f $f ]] || continue
  t=$(stat -f %m "$f")
  if [[ $t -ge $since && $t -gt $best_t ]]; then best=$f; best_t=$t; fi
done
echo "$best"
