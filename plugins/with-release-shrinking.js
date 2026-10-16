// v1.1 (RELEASE_KIT §1c item 10): Android release builds are shrunk with R8 (code) and resource shrinking. The Expo template's
// android/app/build.gradle reads both flags from gradle.properties; libraries ship their own keep rules (React Native, Hermes,
// Expo modules). Debug builds are not affected (the flags only act on the release build type). Measured and proven by the
// Release flows + the .aab size (docs/V1_LOG.md v1.1); remove this plugin from app.config.ts to switch it off.
const { withGradleProperties } = require('expo/config-plugins');

const FLAGS = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

function withReleaseShrinking(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(FLAGS)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

module.exports = withReleaseShrinking;
module.exports.FLAGS = FLAGS;
