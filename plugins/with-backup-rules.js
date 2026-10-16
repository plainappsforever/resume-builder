// Android backup (D76, amends D29; like invoice-maker D87 and the other sibling apps): the CV database (name, address, phone,
// jobs) and the photo are NOT copied to Google's phone backup. The user keeps their own backup file (Settings → Backup and
// data); About and the privacy text say what each platform does. `allowBackup="false"` switches the Google Drive backup off;
// on Android 12+ a device-to-device transfer to a new phone can still copy the app (platform rule).
// P1 set allowBackup="true" with rule files that included files/SQLite and files/photos; `expo prebuild` runs without --clean
// (deletion rule), so this plugin also REMOVES the old rule references from an existing manifest (the XML files it wrote stay
// in android/, unreferenced and harmless).
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withBackupRules(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) throw new Error('with-backup-rules: no <application> in AndroidManifest.xml');
    application.$['android:allowBackup'] = 'false';
    delete application.$['android:dataExtractionRules'];
    delete application.$['android:fullBackupContent'];
    return cfg;
  });
};
