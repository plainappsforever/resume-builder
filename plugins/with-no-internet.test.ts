/**
 * @jest-environment node
 */
// The plugin marks INTERNET (and the permissions release builds never use) for removal in the manifest merge (SPEC A13,
// D77). Whether the built release APK really has no INTERNET is checked with aapt (V1_LOG P6); this keeps the logic honest.
jest.mock('expo/config-plugins', () => ({
  withAndroidManifest: (config: { manifest: unknown }, action: (c: { modResults: { manifest: unknown } }) => unknown) =>
    action({ ...config, modResults: { manifest: config.manifest } }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withNoInternet = require('./with-no-internet');

describe('with-no-internet', () => {
  it('removes INTERNET and the unused permissions, keeps unrelated ones', () => {
    const manifest: { $: Record<string, string>; 'uses-permission': { $: Record<string, string> }[] } = {
      $: {},
      'uses-permission': [
        { $: { 'android:name': 'android.permission.INTERNET' } },
        { $: { 'android:name': 'android.permission.VIBRATE' } },
        { $: { 'android:name': 'android.permission.SYSTEM_ALERT_WINDOW' } },
        { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
        { $: { 'android:name': 'android.permission.CAMERA' } },
      ],
    };
    withNoInternet({ manifest });
    const names = manifest['uses-permission'].map((p) => `${p.$['android:name']}|${p.$['tools:node'] ?? ''}`);
    expect(names).toContain('android.permission.INTERNET|remove');
    expect(names).toContain('android.permission.SYSTEM_ALERT_WINDOW|remove');
    expect(names).toContain('android.permission.READ_EXTERNAL_STORAGE|remove');
    expect(names).toContain('android.permission.WRITE_EXTERNAL_STORAGE|remove');
    // v1.1 (REVIEW_V1 #12): VIBRATE and ACCESS_NETWORK_STATE go too; an unrelated permission is left alone
    expect(names).toContain('android.permission.VIBRATE|remove');
    expect(names).toContain('android.permission.ACCESS_NETWORK_STATE|remove');
    expect(names).toContain('android.permission.CAMERA|');
    expect(names.filter((n) => n.startsWith('android.permission.INTERNET'))).toHaveLength(1);
    expect(manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
  });
});
