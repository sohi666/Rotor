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
    // iOS 1.0 has no in-app purchases. RevenueCat links AdServices and reads the App Tracking
    // Transparency status, so App Review asked for an ATT prompt (Guideline 2.1, Nov 2026).
    // Android keeps it: Google raised nothing, and its runtime fingerprint stays unchanged.
    // Turning purchases on for iOS (1.1): delete this entry and rebuild.
    'react-native-purchases': { platforms: { ios: null } },
  },
};
