// Development builds only (P6, D77, copied from meter-tracker): the inverse of with-no-internet.js. `expo prebuild` runs WITHOUT --clean (deletion
// rule), so the generated AndroidManifest.xml keeps what an earlier PREVIEW/PRODUCTION prebuild wrote — among it the
// `tools:node="remove"` markers for INTERNET and the storage permissions. A development build made after a preview build
// would then ship without INTERNET and could not reach Metro. This plugin removes those markers again and declares
// INTERNET, so the order of preview and development builds never matters.
const { withAndroidManifest } = require('expo/config-plugins');
const { RELEASE_REMOVED } = require('./with-no-internet');

const INTERNET = 'android.permission.INTERNET';
// Markers for CAMERA and RECORD_AUDIO are owned by other plugins and are left alone.
const OWN = new Set(RELEASE_REMOVED);

function withDevNetwork(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const kept = (manifest['uses-permission'] ?? []).filter((p) => !(OWN.has(p.$['android:name']) && p.$['tools:node'] === 'remove'));
    if (!kept.some((p) => p.$['android:name'] === INTERNET)) kept.push({ $: { 'android:name': INTERNET } });
    manifest['uses-permission'] = kept;
    return cfg;
  });
}

module.exports = withDevNetwork;
