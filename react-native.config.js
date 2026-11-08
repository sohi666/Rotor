/**
 * Rotor 1.0 ships without the Google Mobile Ads SDK: the free launch has no ads, and an
 * ad SDK in the binary makes App Store Connect refuse "No data collected"
 * (STATE_ERROR.BINARY_INDICATES_APP_TRACKS_USERS). The JS package stays installed so
 * src/services/admob.ts keeps type-checking; src/services/ads.ts only loads it when the
 * native module is linked.
 *
 * To turn ads on (1.1): delete this entry, remove the two names from "expo.autolinking.exclude"
 * in package.json, put the react-native-google-mobile-ads and expo-tracking-transparency
 * plugins back in app.json (see docs/RELEASE.md, "Turning ads on"), and rebuild both apps.
 */
module.exports = {
  dependencies: {
    'react-native-google-mobile-ads': { platforms: { ios: null, android: null } },
  },
};
