// P6 (D77, SPEC A13): the app has no network code (profile, PDFs, backups and the read-back all run on the phone; the PDF
// reader page is a WebView with local content and a CSP that forbids every network request), so preview and production
// Android builds ship WITHOUT android.permission.INTERNET. A `tools:node="remove"` entry also strips it from library
// manifests during the manifest merge. Development builds keep it: they load JavaScript from Metro (plugins/with-dev-network.js
// undoes these markers when a development prebuild follows a preview prebuild). Adapted from invoice-maker's and
// meter-tracker's plugin; registered by app.config.ts only for APP_VARIANT preview/production.
// The same mechanism strips permissions release builds never use: the overlay permission from the Expo template (dev menu
// only) and the legacy storage permissions (READ/WRITE_EXTERNAL_STORAGE, maxSdk 32, pulled in by expo-file-system and
// expo-image-picker): the app only uses its own folders, the system photo and file pickers and the share sheet.
// v1.1 (REVIEW_V1 #12): also VIBRATE (Expo template; the app has no haptics) and ACCESS_NETWORK_STATE (expo-image/Glide; the
// app has no network): normal permissions, but an app without network code should not list them.
const { withAndroidManifest } = require('expo/config-plugins');

const INTERNET = 'android.permission.INTERNET';

const RELEASE_REMOVED = [
  INTERNET,
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
  'android.permission.ACCESS_NETWORK_STATE',
];

function withNoInternet(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const others = (manifest['uses-permission'] ?? []).filter((p) => !RELEASE_REMOVED.includes(p.$['android:name']));
    for (const name of RELEASE_REMOVED) others.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    manifest['uses-permission'] = others;
    return cfg;
  });
}

module.exports = withNoInternet;
module.exports.RELEASE_REMOVED = RELEASE_REMOVED;
