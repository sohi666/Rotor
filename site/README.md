# Rotor public site

Static pages the stores and AdMob require. Host this folder at the domain used in `app.json > extra.links`
(currently `https://rotor.behtoyi.com`), for example with GitHub Pages, Netlify or the corporate site.

- `privacy.html` / `en/privacy.html`: privacy policy URL for App Store Connect, Google Play and AdMob
- `terms.html` / `en/terms.html`: terms of use
- `app-ads.txt`: must be served at the root of the developer website listed in both stores; fill in the AdMob publisher ID

These are drafts written for the app as built (AdMob with ATT/UMP, RevenueCat, local-only progress, no account).
Have them reviewed before launch, and update them if an analytics or crash-reporting SDK is added.
