// Dev-only route (V1_PLAN rule 15): the implementation is required under `__DEV__`, so release builds (preview,
// production) do not contain it and the route only redirects to Home.
import { Redirect } from 'expo-router';

export default function DebugRoute() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be a require: Metro drops it from release bundles
    const Screen = require('@/debug/probe-screen').default;
    return <Screen />;
  }
  return <Redirect href="/" />;
}
