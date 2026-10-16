#!/usr/bin/env bash
# v1.1 (RELEASE_KIT §1c): 16 KB memory-page compatibility of an Android APK or App Bundle (Google Play requires it for apps
# targeting Android 15+ since 2025-11-01). Two checks, as Android's "Support 16 KB page sizes" guide describes:
#   1. every 64-bit native library's (arm64-v8a, x86_64) LOAD segments are aligned to >= 16 KB (llvm-readelf, 2**14 = 0x4000).
#      16 KB pages exist only on 64-bit devices; 32-bit libraries (armeabi-v7a, x86) are counted as information.
#   2. APK only: uncompressed .so files are 16 KB-aligned inside the zip (zipalign -c -P 16 -v 4)
# Extracts the libraries to artifacts/16kb/<file name>/ (never deletes anything). Exit 0 = all aligned.
# Usage: scripts/check-16kb.sh <app.apk|app.aab>
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
file=${1:?Usage: check-16kb.sh <apk|aab>}
readelf=$(ls "$ANDROID_HOME"/ndk/*/toolchains/llvm/prebuilt/*/bin/llvm-readelf | tail -1)
zipalign=$(ls "$ANDROID_HOME"/build-tools/*/zipalign | tail -1)
out="artifacts/16kb/$(basename "$file")"
mkdir -p "$out"
unzip -o -q "$file" '*.so' -d "$out"
bad=0
total=0
info32=0
total32=0
while IFS= read -r so; do
  # smallest LOAD alignment of this library
  align=$("$readelf" -lW "$so" | awk '$1 == "LOAD" { print $NF }' | sort -u | head -1)
  if [[ $so == */armeabi-v7a/* || $so == */x86/* ]]; then
    total32=$((total32 + 1))
    [[ $((align)) -ge 16384 ]] || info32=$((info32 + 1))
    continue
  fi
  total=$((total + 1))
  if [[ $((align)) -lt 16384 ]]; then
    echo "NOT 16 KB: ${so#"$out"/} (LOAD align $align)"
    bad=$((bad + 1))
  fi
done < <(find "$out" -name '*.so' | sort)
echo "ELF: $((total - bad))/$total 64-bit native libraries with LOAD segments aligned to >= 16 KB (32-bit, not required: $((total32 - info32))/$total32)"
if [[ $file == *.apk ]]; then
  if "$zipalign" -c -P 16 -v 4 "$file" >"$out/zipalign.txt" 2>&1; then
    echo "zipalign -c -P 16: OK"
  else
    echo "zipalign -c -P 16: FAILED (see $out/zipalign.txt)"
    bad=$((bad + 1))
  fi
fi
[[ $bad -eq 0 ]]
