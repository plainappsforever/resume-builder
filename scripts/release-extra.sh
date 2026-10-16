#!/usr/bin/env bash
# v1.1 F11 (REVIEW_V1 #11): the Release flows that need files on the device or a system language, against the installed
# PREVIEW (Release) build, Metro stopped:
#   delete-all-release   the real wipe (no dev-backup in Release)
#   restore-release      Back up now (share sheet) + Restore through the SYSTEM file picker
#   german-photo-release German UI + German example + a photo through the SYSTEM photo picker + Lebenslauf export read back
# Puts the example backup (src/db/backup-fixture.test.ts) and test/fixtures/rb-gps-probe.jpg into the device's files first;
# on Android sets the app's own language to German for the last flow and back afterwards. Writes nothing in the app's data.
# Usage: scripts/release-extra.sh <ios|android>
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
platform=${1:?Usage: release-extra.sh <ios|android>}
APP=com.tim.resumebuilder.preview
UDID=3C8B1EEC-4DB4-4AFD-9E9D-467E128935F6 # ResumeBuilder iPhone (D11)
backup=artifacts/release/Resume-Builder-Backup-Example.json
[[ -f $backup ]] || WRITE_BACKUP_FIXTURE=1 npx jest src/db/backup-fixture.test.ts --silent
if [[ $platform == ios ]]; then
  storage=$(xcrun simctl get_app_container "$UDID" com.apple.DocumentsApp groups | awk '$1 == "group.com.apple.FileProvider.LocalStorage" { print $2 }')
  mkdir -p "$storage/File Provider Storage"
  cp "$backup" "$storage/File Provider Storage/"
  xcrun simctl addmedia "$UDID" test/fixtures/rb-gps-probe.jpg
  export MAESTRO_PICK_X=16% MAESTRO_PICK_Y=25%
else
  adb -s "$ANDROID_SERIAL" push "$backup" /sdcard/Download/ >/dev/null
  adb -s "$ANDROID_SERIAL" push test/fixtures/rb-gps-probe.jpg /sdcard/Pictures/ >/dev/null
  for f in /sdcard/Download/Resume-Builder-Backup-Example.json /sdcard/Pictures/rb-gps-probe.jpg; do
    adb -s "$ANDROID_SERIAL" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$f" >/dev/null
  done
  export MAESTRO_PICK_X=16% MAESTRO_PICK_Y=58%
fi
scripts/e2e.sh "$platform" preview .maestro/release/delete-all-release.yaml .maestro/release/restore-release.yaml
# Android: a fresh state first (what Maestro's clearState does: it also resets the app's own language), then German.
if [[ $platform == android ]]; then
  adb -s "$ANDROID_SERIAL" shell pm clear "$APP" >/dev/null
  adb -s "$ANDROID_SERIAL" shell cmd locale set-app-locales "$APP" --locales de-DE
fi
status=0
scripts/e2e.sh "$platform" preview .maestro/release/german-photo-release.yaml || status=$?
[[ $platform == android ]] && adb -s "$ANDROID_SERIAL" shell cmd locale set-app-locales "$APP" --locales ""
exit $status
