/**
 * @jest-environment node
 */
// Release signing (P7, D85): with a git-ignored keystore.properties the release build type uses the owner's upload key, without it
// the debug key (size/preview builds). The plugin rewrites the generated build.gradle; Claude never creates a keystore.
jest.mock('expo/config-plugins', () => ({
  withAppBuildGradle: (config: unknown, action: (c: { modResults: { contents: string } }) => unknown) => action(config as never),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apply } = require('./with-release-signing');

const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('with-release-signing', () => {
  it('adds a release signing config read from keystore.properties and falls back to the debug key', () => {
    const out = apply(GRADLE);
    expect(out).toContain("rootProject.file('../keystore.properties')");
    expect(out).toContain('signingConfig rootProject.file(\'../keystore.properties\').exists() ? signingConfigs.release : signingConfigs.debug');
    expect(out).toMatch(/release \{\s+def ksFile/);
    // the debug build type keeps the debug key
    expect(out).toMatch(/debug \{\s+signingConfig signingConfigs\.debug\s+\}/);
  });

  it('is idempotent (prebuild without --clean runs it again)', () => {
    const once = apply(GRADLE);
    expect(apply(once)).toBe(once);
  });

  it('never contains a password value or a keystore path of ours', () => {
    expect(apply(GRADLE)).not.toMatch(/storePassword '(?!android)/);
  });

  it('refuses a build.gradle layout it does not recognise', () => {
    expect(() => apply('android { }')).toThrow('layout not recognised');
  });
});
