/**
 * @jest-environment node
 */
// Release variants carry no development-client residue, even after a development prebuild (prebuild runs without --clean).
jest.mock('expo/config-plugins', () => ({
  withInfoPlist: (config: { plist?: unknown }, action: (c: { modResults: unknown }) => unknown) => (config.plist ? action({ ...config, modResults: config.plist }) : config),
  withAndroidManifest: (config: { manifest?: unknown }, action: (c: { modResults: unknown }) => unknown) => (config.manifest ? action({ ...config, modResults: config.manifest }) : config),
  AndroidConfig: { Manifest: { getMainApplicationOrThrow: (m: { manifest: { application: unknown[] } }) => m.manifest.application[0] } },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withoutResidue = require('./without-dev-client-residue');

describe('without-dev-client-residue', () => {
  it('iOS: removes the dev menu keys, the local-network prompt, the Bonjour service and the exp+ scheme', () => {
    const plist: Record<string, unknown> = {
      EXDevMenuShowsAtLaunch: false,
      NSLocalNetworkUsageDescription: 'Expo Dev Launcher …',
      NSBonjourServices: ['_expo._tcp'],
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
      CFBundleURLTypes: [{ CFBundleURLSchemes: ['resumebuilder', 'com.tim.resumebuilder'] }, { CFBundleURLSchemes: ['exp+resume-builder'] }],
      NSPhotoLibraryUsageDescription: 'keep',
    };
    withoutResidue({ plist });
    expect(plist).toEqual({
      CFBundleURLTypes: [{ CFBundleURLSchemes: ['resumebuilder', 'com.tim.resumebuilder'] }],
      NSPhotoLibraryUsageDescription: 'keep',
    });
  });

  it('Android: removes EXDevMenu meta-data and the exp+ scheme, keeps the app’s own', () => {
    const manifest = {
      manifest: {
        application: [
          {
            'meta-data': [{ $: { 'android:name': 'EXDevMenuShowsAtLaunch' } }, { $: { 'android:name': 'expo.modules.updates.ENABLED' } }, { $: { 'android:name': 'keep.me' } }],
            activity: [{ 'intent-filter': [{ data: [{ $: { 'android:scheme': 'resumebuilder' } }, { $: { 'android:scheme': 'exp+resume-builder' } }] }] }],
          },
        ],
      },
    };
    withoutResidue({ manifest });
    const app = manifest.manifest.application[0];
    expect(app['meta-data'].map((m) => m.$['android:name'])).toEqual(['keep.me']);
    expect(app.activity[0]['intent-filter'][0].data.map((d) => d.$['android:scheme'])).toEqual(['resumebuilder']);
  });
});
