#!/usr/bin/env bash
# Build, install and launch the app on the default simulator/emulator.
# Usage: scripts/native.sh <ios|android> [development|preview|production]
#   development: Debug build that loads JavaScript from Metro (start it with `npm run dev`).
#   preview/production: Release build with JavaScript embedded; runs without Metro.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

platform=${1:?Usage: native.sh <ios|android> [development|preview|production]}
variant=${2:-development}
export APP_VARIANT=$variant

# ios/ and android/ are generated from app.config.ts (never edit them by hand).
# Regenerate when the variant, app config or native dependencies change.
# No --clean by default: it deletes ios/ and android/, which only the owner may decide. Opt in with PREBUILD_FLAGS=--clean.
marker="$platform/.generated-for"
stamp="$variant $(cat app.config.ts package-lock.json plugins/*.js | shasum | cut -c1-12)"
if [[ ! -f $marker || "$(cat "$marker")" != "$stamp" ]]; then
  # shellcheck disable=SC2086 # PREBUILD_FLAGS is intentionally word-split
  npx expo prebuild ${PREBUILD_FLAGS:---no-clean} --platform "$platform"
  echo "$stamp" >"$marker"
fi
# Switching variant (development <-> preview) without --clean leaves Gradle's generated autolinking config naming the OLD application
# id (`android/build/generated/autolinking/autolinking.json` is only regenerated when package.json changes), and a Release build then
# fails with "package com.tim.resumebuilder.dev does not exist" (found in P6 here; meter-tracker V1 P6 first). Rewrite the id in
# that generated file (never a deletion); Gradle then regenerates the entry point from it.
if [[ $platform == android && -f android/build/generated/autolinking/autolinking.json ]]; then
  app_id=$(npx expo config --json --type public | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).android.package)')
  node -e '
    const fs = require("fs");
    const [file, id] = process.argv.slice(1);
    const text = fs.readFileSync(file, "utf8");
    const next = text.replace(/("android":\{"packageName":")[^"]*(")/, `$1${id}$2`);
    if (next !== text) { fs.writeFileSync(file, next); console.log(`autolinking.json: packageName -> ${id}`); }
  ' android/build/generated/autolinking/autolinking.json "$app_id"
fi
unset SDKROOT # env.sh sets it for prebuild/pod install only; xcodebuild must pick its own iOS SDK

device=$(scripts/boot.sh "$platform")

if [[ $platform == ios ]]; then
  args=(--device "$device")
  # --no-bundler and --port are mutually exclusive on this Expo CLI: development attaches to the
  # already-running Metro (npm run dev) on our dedicated port; release builds embed JS and need no bundler.
  if [[ $variant == development ]]; then
    args+=(--port "$METRO_PORT")
  else
    args+=(--no-bundler --configuration Release)
  fi
  mkdir -p artifacts
  set +e
  npx expo run:ios "${args[@]}" 2>&1 | tee artifacts/run-ios.log
  status=${PIPESTATUS[0]}
  set -e
  # Expo's final "focus Simulator window" step needs macOS Automation permission; the app is already launched.
  if [[ $status -ne 0 ]] && grep -q "› Opening on" artifacts/run-ios.log && grep -q "System Events" artifacts/run-ios.log; then
    echo "App installed and opened (ignored Simulator window-focus error)."
    status=0
  fi
  [[ $status -eq 0 ]] || exit "$status"
else
  # expo resolves --device by AVD NAME (a serial like emulator-5646 gives "Could not find device with name"); the
  # ANDROID_SERIAL exported by env.sh still pins adb/Gradle to our emulator, so a plugged-in phone never gets an install.
  args=(--device "$ANDROID_AVD")
  if [[ $variant == development ]]; then
    args+=(--port "$METRO_PORT")
    apk_rel=apk/debug/app-debug.apk
  else
    args+=(--no-bundler --variant release)
    apk_rel=apk/release/app-release.apk
  fi
  started=$(date +%s)
  set +e
  npx expo run:android "${args[@]}"
  status=$?
  set -e
  # The owner's Gradle init script (~/.gradle/init.d/build-dir-on-ssd.gradle, 2026-10-04) moves build outputs to the external SSD,
  # but expo looks for the APK only in android/app/build/outputs/apk (where it may find a STALE one). Install the APK this run built.
  apk=$(scripts/find-build-output.sh "$apk_rel" "$started")
  if [[ -n $apk && $apk != android/* ]]; then
    echo "Installing the APK built by this run: $apk"
    adb -s "$ANDROID_SERIAL" install -r "$apk" >/dev/null
    app_id=$(npx expo config --json --type public | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).android.package)')
    adb -s "$ANDROID_SERIAL" shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    status=0
  fi
  [[ $status -eq 0 ]] || exit "$status"
fi

# Dev builds: point the dev client at THIS app's Metro port (other apps run Metro on other ports).
if [[ $variant == development ]]; then
  scheme=$(npx expo config --json --type public | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).scheme)')
  url="$scheme://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$METRO_PORT"
  if [[ $platform == ios ]]; then
    xcrun simctl openurl "$device" "$url" >/dev/null 2>&1 || true
  else
    adb -s "$device" shell am start -a android.intent.action.VIEW -d "$url" >/dev/null 2>&1 || true
  fi
fi
