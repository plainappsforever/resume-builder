/**
 * @jest-environment node
 */
// A development prebuild after a preview prebuild must not keep the release markers (INTERNET is needed for Metro).
jest.mock('expo/config-plugins', () => ({
  withAndroidManifest: (config: { manifest: unknown }, action: (c: { modResults: { manifest: unknown } }) => unknown) =>
    action({ ...config, modResults: { manifest: config.manifest } }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withDevNetwork = require('./with-dev-network');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withNoInternet = require('./with-no-internet');

type Manifest = { $: Record<string, string>; 'uses-permission': { $: Record<string, string> }[] };
const names = (m: Manifest) => m['uses-permission'].map((p) => `${p.$['android:name']}|${p.$['tools:node'] ?? ''}`);

describe('with-dev-network', () => {
  it('undoes a preview prebuild: no remove markers for INTERNET and the storage permissions, INTERNET declared once', () => {
    const manifest: Manifest = { $: {}, 'uses-permission': [{ $: { 'android:name': 'android.permission.CAMERA' } }] };
    withNoInternet({ manifest });
    expect(names(manifest)).toContain('android.permission.INTERNET|remove');
    withDevNetwork({ manifest });
    const after = names(manifest);
    expect(after).toContain('android.permission.INTERNET|');
    expect(after.filter((n) => n.startsWith('android.permission.INTERNET'))).toHaveLength(1);
    expect(after.some((n) => n.endsWith('|remove'))).toBe(false);
    expect(after).toContain('android.permission.CAMERA|');
  });

  it('leaves other plugins’ markers (RECORD_AUDIO) alone', () => {
    const manifest: Manifest = { $: {}, 'uses-permission': [{ $: { 'android:name': 'android.permission.RECORD_AUDIO', 'tools:node': 'remove' } }] };
    withDevNetwork({ manifest });
    expect(names(manifest)).toContain('android.permission.RECORD_AUDIO|remove');
  });
});
