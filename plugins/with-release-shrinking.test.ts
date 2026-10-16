/**
 * @jest-environment node
 */
// v1.1: R8 and resource shrinking for Android release builds via gradle.properties (RELEASE_KIT §1c item 10).
jest.mock('expo/config-plugins', () => ({
  withGradleProperties: (config: { props: unknown[] }, action: (c: { modResults: unknown[] }) => unknown) => action({ ...config, modResults: config.props }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withReleaseShrinking = require('./with-release-shrinking');

it('sets both flags once, also over an existing "false"', () => {
  const props: { type: string; key?: string; value?: string }[] = [
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
    { type: 'comment', value: 'x' },
  ];
  withReleaseShrinking({ props });
  withReleaseShrinking({ props });
  const flags = props.filter((p) => p.type === 'property');
  expect(flags).toEqual([
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
    { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
  ]);
});
