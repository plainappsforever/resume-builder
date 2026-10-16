// From warranty-wallet (P4 there, D42), V1_PLAN P1 step 2. Resume Builder has no notifications at all
// (expo-notifications was removed from the template in v1 P1), so normally there is nothing to strip; the plugin stays
// as a guard: if any later dependency adds the push entitlement or the background "fetch" mode, it is removed from
// the iOS build (a signing team without Push would reject it, and the app never runs in the background).
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withNoPush(config) {
  config = withInfoPlist(config, (mod) => {
    const modes = mod.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) mod.modResults.UIBackgroundModes = modes.filter((m) => m !== 'fetch');
    return mod;
  });
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};
