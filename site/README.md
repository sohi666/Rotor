# Rotor public site

Privacy policy, terms and support pages the stores require, in French (root) and English (`en/`).
Published at https://sohi666.github.io/rotor-info/ from the public repository `sohi666/rotor-info`
(this folder is copied to the repository root there). The app reads the base URL from `app.json > extra.links.site`.

- `privacy.html` / `en/privacy.html`: privacy policy URL for App Store Connect and Google Play
- `terms.html` / `en/terms.html`: terms of use
- `index.html` / `en/index.html`: support and marketing URL
- `app-ads.txt`: for 1.1 (ads). It must be served at the root of the developer website listed in both
  stores (https://sohi666.github.io/app-ads.txt), with the AdMob publisher ID filled in.

The pages describe 1.0 (no ads, no purchases, nothing collected). Update them before any release that
switches on AdMob, RevenueCat, analytics or crash reporting.
