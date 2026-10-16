#!/usr/bin/env bash
# Android App Bundle (.aab) for Google Play (adapted from job-camera's scripts/bundle-release.sh). Local and free; uploads nothing.
# Usage: scripts/bundle-release.sh [preview|production]   (default preview)
#   - prebuild (no --clean) when the variant or the config changed, exactly like scripts/native.sh (same stamp)
#   - ./gradlew bundleRelease for arm64-v8a, armeabi-v7a, x86_64 (no 32-bit x86: no phone sold today uses it)
#   - signed with the owner's upload key when keystore.properties exists (plugins/with-release-signing.js), otherwise
#     with the DEBUG key: such a bundle is for size checks only and Google Play refuses it
#   - copies the bundle to artifacts/builds/ResumeBuilder-v<version>-<variant>.aab (version from app.config.ts, v1.1), prints the
#     per-ABI native code sizes and runs the 16 KB page-size check (scripts/check-16kb.sh)
# Never creates a keystore: the owner does (docs/V1_LOG.md P7, "Upload key").
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

variant=${1:-preview}
[[ $variant == preview || $variant == production ]] || { echo "variant must be preview or production"; exit 2; }
export APP_VARIANT=$variant

marker="android/.generated-for"
stamp="$variant $(cat app.config.ts package-lock.json plugins/*.js | shasum | cut -c1-12)"
if [[ ! -f $marker || "$(cat "$marker")" != "$stamp" ]]; then
  # shellcheck disable=SC2086
  npx expo prebuild ${PREBUILD_FLAGS:---no-clean} --platform android
  echo "$stamp" >"$marker"
fi
# Same autolinking package-id repair as scripts/native.sh (a variant switch leaves the old application id in the generated file).
if [[ -f android/build/generated/autolinking/autolinking.json ]]; then
  app_id=$(npx expo config --json --type public | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).android.package)')
  node -e '
    const fs = require("fs");
    const [file, id] = process.argv.slice(1);
    const text = fs.readFileSync(file, "utf8");
    const next = text.replace(/("android":\{"packageName":")[^"]*(")/, `$1${id}$2`);
    if (next !== text) { fs.writeFileSync(file, next); console.log(`autolinking.json: packageName -> ${id}`); }
  ' android/build/generated/autolinking/autolinking.json "$app_id"
fi

[[ -f keystore.properties ]] || echo "NOTE: keystore.properties not found - this bundle is signed with the DEBUG key (size check only, not uploadable)."

started=$(date +%s)
(cd android && ./gradlew bundleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64 --console=plain 2>&1 | grep -E "BUILD|FAILURE|error:|What went wrong" || true)
# The bundle is in android/app/build, or — with the owner's Gradle init script (~/.gradle/init.d/build-dir-on-ssd.gradle,
# 2026-10-04) — under /Volumes/Zweite/claude/gradle-build/<root project>/app/. Take the newest one built by this run.
aab=$(scripts/find-build-output.sh bundle/release/app-release.aab "$started")
[[ -n $aab && -f $aab ]] || { echo "no bundle built by this run"; exit 1; }

mkdir -p artifacts/builds
version=$(npx expo config --json --type public | node -e 'const v = JSON.parse(require("fs").readFileSync(0, "utf8")).version; console.log(v.replace(/\.0$/, ""))')
out="artifacts/builds/ResumeBuilder-v${version}-${variant}.aab"
cp "$aab" "$out"
echo "bundle: $out ($(stat -f %z "$out") bytes)"
# Per-ABI native libraries inside the bundle (compressed / uncompressed bytes). A phone downloads ONE ABI plus dex and resources.
unzip -v "$out" | awk '/ base\/lib\// { split($8, p, "/"); abi = p[3]; c[abi] += $3; u[abi] += $1 }
  / base\/dex\// { dc += $3; du += $1 }
  END { for (a in c) printf "  lib %-12s %10d compressed  %10d uncompressed\n", a, c[a], u[a]; printf "  dex          %10d compressed  %10d uncompressed\n", dc, du }'
# Signing certificate of the bundle (jarsigner, from the JDK): the owner's upload key, or "Android Debug" without keystore.properties.
jarsigner -verify -verbose:summary -certs "$out" 2>/dev/null | grep -m1 -E "CN=" | sed 's/^ */  signed by: /' || true
scripts/check-16kb.sh "$out" | tail -2
