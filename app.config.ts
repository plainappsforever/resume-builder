import type { ConfigContext, ExpoConfig } from 'expo/config';

// One codebase, three installable variants that can sit side by side on a device.
// Select with APP_VARIANT (set by scripts/native.sh and eas.json).
const VARIANTS = {
  development: { name: 'Resume Builder Dev', id: 'com.tim.resumebuilder.dev', scheme: 'resumebuilder-dev' },
  preview: { name: 'Resume Builder Preview', id: 'com.tim.resumebuilder.preview', scheme: 'resumebuilder-preview' },
  production: { name: 'Resume Builder', id: 'com.tim.resumebuilder', scheme: 'resumebuilder' },
} as const;

type Variant = keyof typeof VARIANTS;

const variant = (process.env.APP_VARIANT ?? 'development') as Variant;
if (!(variant in VARIANTS)) {
  throw new Error(`Unknown APP_VARIANT "${variant}". Use development, preview or production.`);
}
const { name, id, scheme } = VARIANTS[variant];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: 'resume-builder',
  // v1.1 (release kit §2/§1c): marketing version 1.1.0; build number / versionCode 10100 (= 1.1.0, room for 1.1.x builds).
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: id,
    icon: './assets/expo.icon',
    buildNumber: '10100',
    // No encryption beyond the OS's own (no network code, no crypto in src/): App Store Connect stops asking (D77).
    config: { usesNonExemptEncryption: false },
    // v1.1 (REVIEW_V1 #22): the privacy manifest is pinned here instead of coming from the template default. Reasons: UserDefaults
    // CA92.1 (the app's own settings, React Native), SystemBootTime 35F9.1 (time intervals), FileTimestamp C617.1 (the app's own
    // files). No tracking, no collected data (the app has no network code).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
      ],
    },
  },
  android: {
    package: id,
    versionCode: 10100,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    // FIRST, so its mods run after the others: preview/production carry no dev-client keys, even from an earlier development
    // prebuild (prebuild runs without --clean). D77.
    ...(variant === 'development' ? [] : ['./plugins/without-dev-client-residue.js' as const]),
    // A no-clean prebuild never removes the URL scheme another variant's earlier prebuild wrote (D77).
    ['./plugins/with-own-scheme-only.js', { own: scheme, all: Object.values(VARIANTS).map((v) => v.scheme) }],
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#6A1B9A', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    'expo-sqlite',
    // UI language follows the device (D25): declare both languages so iOS/Android report German as supported.
    ['expo-localization', { supportedLocales: { ios: ['en', 'de'], android: ['en', 'de'] } }],
    // Photo via the system picker (PHPicker / Android photo picker): no camera, no microphone, no storage permission.
    [
      'expo-image-picker',
      { photosPermission: 'Resume Builder lets you add a photo to your CV.', cameraPermission: false, microphonePermission: false },
    ],
    // No notifications in v1 (V1_PLAN P1): guard that strips a push entitlement / background fetch if one appears.
    './plugins/with-no-push.js',
    // Dev builds reopen the last Metro server directly, so Maestro can launch them unattended. Development only (D77).
    ...(variant === 'development' ? [['expo-dev-client', { launchMode: 'most-recent' }] as [string, object], './plugins/with-dev-menu-defaults.js' as const] : []),
    // Android OS backup off: the CV data is not copied to Google's phone backup; the user keeps their own backup file (D76).
    './plugins/with-backup-rules.js',
    // The app has no network code, so release builds have no INTERNET permission (SPEC A13, D77). Dev builds need it for Metro
    // (with-dev-network undoes the markers of an earlier preview prebuild).
    ...(variant === 'development' ? ['./plugins/with-dev-network.js' as const] : ['./plugins/with-no-internet.js' as const]),
    // Android release builds are signed with the owner's upload key when the git-ignored keystore.properties exists; otherwise with the debug key (D85).
    './plugins/with-release-signing.js',
    // Android release builds are shrunk with R8 and resource shrinking (v1.1, RELEASE_KIT §1c item 10; measured in docs/V1_LOG.md).
    './plugins/with-release-shrinking.js',
    // Xcode 27 / iOS 27 SDK: apps without the UIScene lifecycle trap at launch. SDK 57 opt-in (expo >= 57.0.23,
    // expo-build-properties >= 57.0.20); SDK 58+ has it by default, then remove this line. See docs/DECISIONS.md.
    ['expo-build-properties', { ios: { enableSceneSupport: true } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant,
  },
});
