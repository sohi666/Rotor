# Rotor release manual

How **Rotor: Daily Lock** (`com.behtoyi.rotor`, Consultation Behtoyi Inc.) gets from a git tag to the App Store and Google Play, what you (the human) must do once, and what each push notification asks of you.

Everything runs in GitHub Actions. iOS builds run on EAS cloud macOS workers; Android builds run on the GitHub runner itself with `eas build --local` (the EAS free-tier Android workers stalled and hit their 45-minute cap). Nothing needs a Mac on your side.

```
tag v1.2.3 / "Run workflow"
  └─ prepare ── checks secrets, tag == app.json version
      └─ gate ── tsc, vitest, verify:levels, metadata lint
          ├─ build (iOS) ──────── eas build on EAS cloud macOS ── submit-ios ── eas submit → TestFlight ── store URLs live? ── fastlane deliver → App Review
          └─ build-android ────── eas build --local on ubuntu-latest (.aab attached to the run) ── submit-android ── eas submit --path → Play track
```

Workflows: `.github/workflows/ci.yml` (every push/PR), `release.yml`, `store-status.yml`.
Pipeline config: `eas.json`, `fastlane/` (Fastfile, Appfile, metadata, `app_rating_config.json`), `Gemfile`, `scripts/`.

---

## 1. One-time setup (in this order)

Each step says which **repository secret** or **variable** it produces. Add them in GitHub under **Repo → Settings → Secrets and variables → Actions**. Secrets go in the *Secrets* tab and variables in the *Variables* tab.

### A. Notifications first (so you see everything that follows)

1. Install the **ntfy** app (App Store / Google Play) → **+** → topic `rotor-sb-7q4m2x9k`, server `https://ntfy.sh` → Subscribe.
2. Secret **`NTFY_TOPIC`** = `rotor-sb-7q4m2x9k`.
   - ntfy.sh topics are public to anyone who knows the name. The pipeline never sends secrets or download links that work without a login. To lock the topic later, reserve it with an ntfy account and add an access token. The scripts already read `NTFY_TOKEN`, but the workflows don't pass it yet.

### B. GitHub

3. Create the **private** repository and push the project. Default branch `main`.
4. Commit a `Gemfile.lock`. Either run `bundle lock --add-platform x86_64-linux` on any machine with Ruby 3.3, or copy the lock that `ruby/setup-ruby` generates on the first run. This pins fastlane.

### C. Expo / EAS

5. Log in and link the project: `npx eas-cli@latest login`, then `npx eas-cli@latest init`. This writes `expo.owner` and `expo.extra.eas.projectId` into `app.json` (coordinate with whoever owns `app.json`). Commit it.
6. Create a CI token. **expo.dev → (account) → Settings → Access tokens → Create token**. A *robot* user with Developer role is preferable to a personal token. → secret **`EXPO_TOKEN`**.
7. Build numbers are kept remotely (`cli.appVersionSource: remote`) and bumped on every production build. Only if a store already has builds should you run `npx eas-cli@latest build:version:set -p ios` (and `-p android`) and enter the last number used.

### D. Apple (individual account `sohrab behtoyi`, team 3EJ7FPDYM4, for now)

The corporate (Organization) enrollment is pending. Rotor ships from the individual account; once the corporate account is approved and v1.0 is live, move it with **App Store Connect → Apps → Rotor → App Information → Transfer App**, then re-run `eas credentials -p ios` under the new team and update `APPLE_TEAM_ID` and the `ASC_*` secrets.


8. **Bundle ID.** Go to **developer.apple.com → Account → Certificates, Identifiers & Profiles → Identifiers → +** → App IDs → App. Choose Explicit `com.behtoyi.rotor` and enable *In-App Purchase*. (Step 11 also creates the ID if it is missing.)
9. **App record.** Go to **App Store Connect → Apps → + → New App**. Platform iOS, Name `Rotor: Daily Lock`, **Primary Language French (Canada)**, Bundle ID `com.behtoyi.rotor`, SKU `ROTOR-001`, User Access Full.
   - Then **App Information → General Information → Apple ID** (a number) → secret **`ASC_APP_ID`**.
   - The English (U.S.) localization is added by `deliver` from `fastlane/metadata/en-US`. If it isn't, add it under App Information → Localizable Information → language menu.
   - Both listings use the chosen name "Rotor: Daily Lock". A localized French name (e.g. "Rotor : Combinaison du jour") can be set later in `fastlane/metadata/fr-CA/name.txt` and the Play fr-CA `title.txt`.
10. **API key.** Go to **App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys**. The Account Holder clicks *Request Access* once. Then **Generate API Key**: name `rotor-ci`, access **Admin** (needed so CI can repair provisioning profiles).
    - **Download the .p8** (you can only do this once). Paste its full text into secret **`ASC_KEY_P8`**.
    - **Key ID** → secret **`ASC_KEY_ID`**. **Issuer ID** (top of the page) → secret **`ASC_ISSUER_ID`**.
11. **Signing on EAS (once, on any computer with Node).** Run `npx eas-cli@latest login`, then:
    - `npx eas-cli@latest credentials -p ios` → *production* → set up build credentials (log in with your Apple ID). This creates the distribution certificate and App Store provisioning profile, which CI then reuses. Non-interactive CI cannot create a distribution certificate.
    - `npx eas-cli@latest credentials -p android` → *production* → generate a new keystore (EAS stores it; back it up from the same menu).
12. Variable **`APPLE_TEAM_ID`** defaults to `3EJ7FPDYM4` (individual account) in `release.yml`; set the repo variable only to override it. With it, CI exports the `EXPO_ASC_*` env vars so `eas build` can repair an expired or invalid provisioning profile by itself. If that repair fails with a permissions error, the key needs the **Admin** role (the key above already uses Admin).
13. **Business.** Go to **App Store Connect → Business**. The Paid Apps Agreement must stay active (it is), with banking and tax forms complete. When Apple publishes a new agreement, the Account Holder must accept it before uploads work again (ACTION NEEDED "Apple agreement").
14. Before the **first** review submission (see section 2), in App Store Connect:
    - **App Privacy**: fill and **Publish** it (draft answers in `docs/store-forms.md`).
    - **Pricing and Availability**: Free, then countries.
    - **In-App Purchases → +**: create these product IDs exactly as the app expects them (`src/services/config.ts`): Non-Consumable `rotor_remove_ads` ("Retirer les pubs" / "Remove ads"), and Consumables `rotor_coins_600`, `rotor_coins_1500`, `rotor_coins_4000`, each with fr-CA and en-US display names, price and review screenshot. Create the same IDs in Play Console → Monetize → In-app products, and in RevenueCat attach `rotor_remove_ads` to an entitlement named `no_ads`. Your **first** in-app purchase must be attached to an app version: on the version page, go to *In-App Purchases and Subscriptions* → select it. `deliver` does not do this.
    - **Screenshots**: 6.9-inch iPhone. Add 13-inch iPad screenshots too while `ios.supportsTablet` is `true`. Put PNGs in `fastlane/screenshots/fr-CA/` and `fastlane/screenshots/en-US/` and the pipeline uploads them (it replaces the existing ones), or upload them by hand.
    - **App Review contact** (version page → App Review Information): name, phone, email. The pipeline only uploads the reviewer notes (`fastlane/metadata/review_information/notes.txt`); check they match the build, including the presence of a *Restore purchases* button.

### E. Google Play (Organization account, so the 12-tester closed-test rule does not apply)

15. **Create the app.** Go to **Play Console → Home → Create app**. Name `Rotor: Daily Lock`, **Default language Français (Canada) – fr-CA**, Game, Free. Accept the declarations.
16. *(Variable)* open the app's dashboard and copy the browser URL → variable **`PLAY_CONSOLE_APP_URL`** (tap-through target for Android notifications).
17. **Service account.**
    - **console.cloud.google.com** → create a project (e.g. `rotor-publishing`).
    - **APIs & Services → Library → "Google Play Android Developer API" → Enable**.
    - **IAM & Admin → Service Accounts → Create service account** `rotor-ci`. It needs no Cloud roles.
    - Open it → **Keys → Add key → Create new key → JSON**. Paste the whole file into secret **`GOOGLE_SERVICE_ACCOUNT_JSON`**.
    - Linking the Cloud project in Play Console is no longer required.
18. **Give it access.** Go to **Play Console → Users and permissions → Invite new users**. Email = the service account's address. Under **App permissions → Add app → Rotor**, tick:
    - View app information (read-only)
    - Release to production, exclude devices, and use Play App Signing
    - Release apps to testing tracks
    - Manage testing tracks and edit tester lists
    - Manage store presence

    Then **Invite user**. Leave the account permissions off.
19. **Internal testers.** Go to **Test and release → Testing → Internal testing → Testers**. Create an email list and add yourself.
20. **First upload** → section 2, step 3.
21. **App content** (**Policy and programs → App content**), all required before production:
    - Privacy policy URL
    - **Ads: Yes**
    - App access: all functionality available without special access
    - **Content rating** (IARC questionnaire)
    - **Target audience and content** (13–15, 16–17, 18+)
    - **Data safety**
    - **Advertising ID: Yes** (Advertising or marketing, Analytics, Fraud prevention)
    - Government apps: No. Financial features: none. Health: No.
    - If Play asks for a **Foreground service** or **microphone** declaration, the `expo-audio` plugin is still on its defaults. Fix `app.json` (see `docs/store-forms.md` §2) rather than declaring them.

    Answers are drafted in `docs/store-forms.md`.
22. **Store listing graphics** (**Grow users → Store presence → Main store listing**): 512×512 icon, 1024×500 feature graphic, 2–8 phone screenshots per language. The text comes from `fastlane/metadata/android/*`. CI uploads text and images after every Android upload (set variable **`PLAY_SYNC_LISTING`** = `false` to stop it); images live under `fastlane/metadata/android/<locale>/images/` (`icon.png`, `featureGraphic.png`, `phoneScreenshots/1.png`…).

### F. Web pages (GitHub Pages, repo `sohi666/rotor-info`)

23. The privacy policy, terms and support pages are static files in the public repo **`sohi666/rotor-info`**, served by GitHub Pages from `main` / root. French is the root, English is under `/en/`. The source of truth is `site/` in this repo: edit there, then copy into `rotor-info` and push.

    | Files (fr-CA and en-US) | URL | Notes |
    |---|---|---|
    | `fastlane/metadata/*/privacy_url.txt` | https://sohi666.github.io/rotor-info/privacy.html (fr), …/rotor-info/en/privacy.html (en) | Same page the app links to (`extra.links.site` in `app.json` + `siteLink()`). Also the Play privacy policy URL (App content). |
    | `fastlane/metadata/*/support_url.txt` | https://sohi666.github.io/rotor-info/ (fr), …/rotor-info/en/ (en) | Contact: support@cibinc.ca. |
    | `fastlane/metadata/*/marketing_url.txt` | Same as support | Also the AdMob developer website (step 24) once ads go on in 1.1. |

    If the site moves (e.g. to a behtoyi.com domain), update these files **and** `extra.links` in `app.json` together.

    The iOS review step refuses to submit while any of these does not answer (ACTION NEEDED "store URLs not live"). 1.0 collects nothing (no ads, no purchases, no analytics), and the policy says so. When 1.1 turns on AdMob and RevenueCat, the policy must describe them (advertising ID, IP-based coarse location, purchase records) before that build ships. In Québec it must also follow Law 25: name a person in charge of personal information and explain how to contact them.
24. **AdMob app-ads.txt (1.1, when ads go on).** Host `app-ads.txt` at the root of the developer website's domain. A github.io project page is not a domain root, so this needs either the `sohi666.github.io` user site or a custom domain containing your AdMob line:
    `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
    Then set the same site as the developer website. Play: **Grow users → Store presence → Store settings → Store listing contact details → Website**. App Store: the marketing URL above. Finally use **AdMob → Apps → app-ads.txt → Check for updates**. Until AdMob verifies it, ad serving is limited.

---

## 2. Cutting a release

### Normal release
1. Bump `expo.version` in `app.json` (e.g. `1.2.3`). Update `fastlane/metadata/*/release_notes.txt` and `fastlane/metadata/android/*/changelogs/default.txt`. Commit.
2. `git tag v1.2.3 && git push origin v1.2.3`

A tag push uses these variables (defaults in brackets): `RELEASE_PLATFORM` [all], `RELEASE_ANDROID_TRACK` [production], `RELEASE_ANDROID_STATUS` [completed], `RELEASE_SUBMIT_FOR_REVIEW` [true]. The tag must equal `v` + `expo.version`, or the run stops with an ACTION NEEDED.

**Manual run:** **Actions → Release → Run workflow**, with these inputs:
- `platform` (all/ios/android)
- `android_track` (internal/production)
- `android_release_status` (completed = send to review / roll out; draft = upload only)
- `submit_for_review` (iOS)
- `ios_review_only`: no build; re-submits the newest processed build. Use it after a rejection or after fixing App Privacy or screenshots.
- `ios_build_id` (optional): reuse a finished EAS iOS build (the ID at the end of its expo.dev build page) instead of building again. Use it when the build passed but the upload step failed.
- `android_promote`: no Android build; promotes the newest internal-testing release (the build you tested) to production and sends it to Google review. The usual way to release Android: test on internal, then promote.

The Play store listing (`fastlane/metadata/android`: texts, screenshots, feature graphic, icon) is uploaded with every Android release. Set the repository variable `PLAY_SYNC_LISTING=false` to stop that. A listing failure sends its own ACTION NEEDED and never blocks the build upload.

Build numbers increase by themselves (remote, `autoIncrement`). Every production build uses one EAS build credit, failed ones included.

The Android job runs on GitHub's small private-repo runner (2 cores, about 7 GB RAM). It adds 10 GB of swap and limits Gradle to 2 workers with a 4 GB heap; without that the runner ran out of memory and disconnected. A `[runner] … mem … swap …` line every 2 minutes in the log shows memory use. TestFlight uploads carry no "What to test" note: EAS accepts that only on its Enterprise plan, so type it in App Store Connect → TestFlight if testers need one.

### First release (recommended order)
1. Do section 1 up to step 19.
2. **Run workflow** with `platform=ios`, `submit_for_review=false`. The build goes to TestFlight, so you can test it on your phone.
3. **Run workflow** with `platform=android`, `android_track=internal`, `android_release_status=draft`. You will get one of:
   - "ACTION NEEDED: first Android upload is manual". Google refused the API upload because the app has never received a build (the classic Play API limit). Tap **Download .aab**, then go to **Play Console → Test and release → Testing → Internal testing → Create new release** → upload → **Next → Save and publish**.
   - "ACTION NEEDED: roll out … on internal". The API accepted a draft. Open it and publish it there.
   - Current Expo docs say the first upload now works through the API. The pipeline tries it and falls back to the manual route.
4. Finish section 1 steps 14, 21–24 and publish the web pages.
5. **Run workflow** with `ios_review_only=true`. The pipeline uploads metadata and age rating, attaches the build and submits for review. If Apple refuses, the ntfy message names the blocker (App Store page setup with mode `check-review` asks Apple without submitting).
6. **Android, first production release** (what worked for 1.0.0 on 2026-11-08):
   - Play Console → Dashboard → "Set up your app": all 11 tasks, plus **App content → Advertising ID** (not on the dashboard list, but required for Android 13+ targets) and **Production → Countries / regions**. Answers are in `docs/store-forms.md`.
   - **Run workflow** with `platform=android`, `android_promote=true`, `android_release_status=draft`. While the app has never been published, Google accepts only draft releases from the API ("Only releases with status draft may be created on draft app").
   - Play Console → **Production → Releases → Edit release**: add release notes (from `fastlane/metadata/android/*/changelogs/default.txt`), **Next → Save**. Then **Publishing overview → Submit N changes for review**.
   - With Managed publishing off, the app goes live by itself once Google approves it.
   From the second release on, `android_release_status=completed` works and step 7 is enough.
7. After this, `git tag vX.Y.Z` handles both stores.

What the iOS review step does (`bundle exec fastlane ios submit_review`):
- Waits until the build has finished processing.
- Uploads metadata from `fastlane/metadata`, categories, age rating (`fastlane/app_rating_config.json`) and screenshots, if any.
- Leaves out "What's New" on the very first version (Apple doesn't allow it).
- Sets export compliance = no non-exempt encryption and content rights = no third-party content.
- Submits with **manual release** (after approval you press *Release*), plus **phased release** for updates.

You can run the lanes yourself on any OS with Ruby 3.3. Run `bundle install`, export the `ASC_*` variables (and `ASC_API_KEY_PATH=/path/AuthKey_X.p8`), then:
`bundle exec fastlane ios metadata` · `bundle exec fastlane ios submit_review` · `GOOGLE_SERVICE_ACCOUNT_KEY_PATH=… bundle exec fastlane android metadata`

---

## 3. Notifications

Priorities: `low` (2), `default` (3), `high` (4), `urgent` (5). Anything that needs you starts with **ACTION NEEDED**. Tapping a notification opens the right console page or the run log.

### From a release run
| Notification | Priority | Meaning |
|---|---|---|
| `Rotor X: build started (all)` | low | Tests passed; EAS build queued. |
| `Rotor build FAILED (ios, ERRORED)` | urgent | Native build failed. Tap for the EAS build logs. |
| `Rotor X: release FAILED before the build` | urgent | tsc / vitest / `verify:levels` / metadata lint failed. |
| `Rotor iOS X (N) uploaded to TestFlight` | default | Apple is processing (10–30 min). |
| `Rotor iOS X submitted for App Review` | default | Waiting for Apple; the store monitor follows it from here. |
| `Rotor Android X (N) uploaded to Play <track>` | default | Committed and sent to Google review (internal: testers get it within minutes). |
| `TestFlight upload FAILED` / `Play upload FAILED` / `iOS review submission FAILED` | urgent | Unrecognized error. Read the end of the run log. |

### ACTION NEEDED (release run)
| Title | What to do |
|---|---|
| **Rotor release cannot start** | A secret is missing or the tag ≠ `app.json` version. The message names it. |
| **store release with test config** | Non-blocking warning for review/production runs. `app.json` still has Google's sample AdMob IDs, `extra.ads.useTestIds: true` or empty RevenueCat keys. Put the real IDs in and release again before going live. |
| **iOS signing credentials** | Run `npx eas-cli@latest credentials -p ios` → production → set up (step 11). Optionally set `APPLE_TEAM_ID`. |
| **EAS build quota** | Free plan used up (15 iOS builds per month; Android builds on the GitHub runner and does not count). Wait for the reset or upgrade. |
| **EAS project link** / **Expo token** | Run `eas init` and commit `app.json` / renew `EXPO_TOKEN`. |
| **first Android upload is manual** | Download the .aab (button; GitHub login, kept 14 days) → Play Console → Internal testing → Create new release → upload → Save and publish. |
| **Play app is still a draft** | Re-run with `android_track=internal`, `android_release_status=draft`; finish the Dashboard tasks; publish there. |
| **roll out … on <track>** | A draft release was created on purpose. Open it in Play Console → Next → Save and publish. |
| **upload Rotor Android … by hand** | `GOOGLE_SERVICE_ACCOUNT_JSON` isn't set yet. Upload the attached .aab yourself or add the secret. |
| **Play service account permissions** | Step 18: grant the release permissions for Rotor. |
| **Android version code** / **iOS build number** | The store already has that number. Use `npx eas-cli@latest build:version:set -p android|ios` with a higher one, then rebuild. |
| **store URLs not live** | Publish the privacy, support and marketing pages, or fix `*_url.txt` (step 23). |
| **App Privacy questionnaire** | App Store Connect → App Privacy → fill (store-forms.md) → **Publish** → Run workflow with `ios_review_only`. |
| **iOS screenshots** | Add PNGs to `fastlane/screenshots/<locale>/` or upload them in ASC → `ios_review_only`. |
| **pricing and availability** / **content rights** / **age rating** / **app category** | Fix the named section in App Store Connect (or `fastlane/app_rating_config.json` if Apple added age-rating questions) → `ios_review_only`. |
| **export compliance** | Answer it on the build (TestFlight). Make sure `ios.config.usesNonExemptEncryption: false` is in `app.json` so it never comes back. |
| **Apple agreement** | Account Holder accepts the new agreement (App Store Connect → Business). |
| **build still processing** / **build not found** / **build rejected by processing** | Wait and use `ios_review_only` / read Apple's email about the invalid binary. |
| **review submission busy** | A submission is already open. Cancel or finish it in App Review → `ios_review_only`. |
| **release notes** | Set variable `IOS_FIRST_RELEASE=true` for the first version, then delete it afterwards. |

### From the store monitor (every 30 minutes, only on change)
| Title (examples) | Priority | What to do |
|---|---|---|
| `Rotor iOS: 1.0.0 waiting for review` / `in review` | default | Nothing. |
| **ACTION NEEDED: Rotor iOS: 1.0.0 APPROVED, release it** | high | App Store Connect → Distribution → this version → **Release This Version** (manual release is on). |
| **ACTION NEEDED: … REJECTED** / **review issues (rejected)** | urgent | See *Rejections* below. |
| **ACTION NEEDED: … METADATA REJECTED** | urgent | Fix the listing text or screenshots (no new build) → reply in App Review or `ios_review_only`. |
| **ACTION NEEDED: … INVALID BINARY** / `build … processing FAILED` | urgent | Apple emails the reason (missing usage string, entitlement…). Fix and release a new build. |
| **ACTION NEEDED: … export compliance needed** | high | Answer it on the build in TestFlight. |
| `Rotor iOS: 1.0.0 LIVE` | high | It's on the App Store. |
| `Rotor iOS: build 1.0.0 (7) ready in TestFlight` | default | Test it on your phone. |
| **ACTION NEEDED: Rotor Android: production draft waiting** | high | Play Console → that track → Edit release → roll out. |
| `Rotor Android: production completed` | default | Committed and in review or live. The Play API cannot tell which; check **Publishing overview**. Google emails rejections. |
| **ACTION NEEDED: … API key refused** / **service account refused** / **app not on Play yet** | high | Credentials revoked or missing permission, or the app/first upload doesn't exist yet. Sent once per change, not every 30 min. |

### Rejections (App Store)
1. App Store Connect → Apps → Rotor → **App Review** (Resolution Center): read Apple's message. The API cannot fetch it.
2. If it's a misunderstanding, **reply** there. No new build is needed and the review restarts.
3. If it's metadata (description, screenshots, privacy URL, age rating), fix `fastlane/metadata`, commit, then **Run workflow → `ios_review_only`**.
4. If the binary must change, fix the code, bump `expo.version` (or keep it; the build number increases), then tag a new release.
6. **Guideline 2.1, ATT not found** (1.0.0 (5), 2026-11-16). "The app uses the AppTrackingTransparency framework, but we are unable to locate the ATT permission request." The cause was a library that references ATT or AdServices (RevenueCat), not our code. Run **Inspect iOS build** to find the reference, unlink the library for that platform in `react-native.config.js`, build iOS only (`submit_for_review=false`), inspect the new build, then run **App Store page setup** with mode `resubmit`, `review_phone` and `build_number=<new build>`. Explain it in the first section of `notes.txt`.
7. **"Cannot submit version due to unfulfilled compliance requirement"** (`PPM.compliance.form…NEW_APP_SUBMISSION_BLOCK`, 2026-11-17). New questionnaires appeared under **App Store Connect → App Compliance**: *Security Assessment* and *AI Generated or Synthetic Content* (both China mainland). Rotor's answers are **No** for both. There's no API for them, so fill them in the browser. To pull a waiting version and attach a new build, use **App Store page setup** with mode `swap-build` and `build_number`.
5. **Guideline 2.1 "Information Needed"** (1.0.0 got this on 2026-11-08). Apple asks for a screen recording on a physical device (starting from the app launch) plus purpose, usage, external services, regions and licensed material. The written answers are in `fastlane/metadata/review_information/notes.txt`. Put the recording in the repo (compressed H.264 .mp4), then **App Store page setup** with mode `resubmit`, `review_phone` and `review_attachment=<path>`. It sends the notes, attaches the video, marks the rejected item resolved and resubmits the open submission, with no App Store Connect sign-in needed (`review-notes` mode does the same without resubmitting). Leave `review_attachment` empty to keep the attachment already uploaded.

Typical risks for this app:
- **ATT:** the prompt must appear before any tracking, and the App Privacy answers must say Device ID is used for tracking (store-forms.md).
- **IAP:** "Remove ads" needs a working *Restore purchases* button.
- **Guideline 2.3.8:** ads must suit the age rating. Set AdMob's max ad content rating to match (see store-forms.md).
- **Guideline 4.2:** minimum functionality; the game passes this easily.

---

## 4. Store monitor details

- `scripts/store-status.mjs` uses Node 22 with no dependencies. It signs its own JWTs with `node:crypto`: ES256 with the `.p8` for App Store Connect, and the RS256 OAuth JWT-bearer flow for Google.
- **App Store Connect:** the newest App Store version state, the newest review submission (`UNRESOLVED_ISSUES` = rejection) and the newest TestFlight build processing state.
- **Google Play:** opens an edit, lists every track's releases and **deletes** the edit. It never commits. While a Release run is in progress, the Play check is skipped so it never opens an edit next to EAS Submit's.
- **State:** `.store-status/state.json` in the **GitHub Actions cache**. Each run restores the newest entry (key prefix `store-status-v1-`). It saves a new entry only when something changed (cache keys are immutable), so at most one small entry per change. GitHub evicts entries unused for 7 days or past 10 GB, and the monitor then re-records a low-priority baseline. **Run workflow → reset** re-announces the current status.
- **Pause it** for free: variable `STORE_STATUS_PAUSED=true`. Skipped jobs aren't billed.
- Missing secrets → that store is skipped with a log line (no failure). Errors are reported once when they appear and once when they clear.
- **Local dry run:** `ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_APP_ID=… ASC_API_KEY_PATH=… node scripts/store-status.mjs --dry-run`.

---

## 5. Costs (checked 2026-11-06)

| Item | Cost |
|---|---|
| **EAS Free** (expo.dev/pricing) | Up to **15 iOS + 15 Android builds / month**, low-priority queue, 45-min build timeout, 1 concurrent macOS build. Blocked (not billed) at the limit. A release of both platforms uses 2 builds. |
| EAS Starter | US$19/month + usage, includes US$45 of build credit, high-priority queue, 2-hour timeout. Production: US$199/month (US$225 credit). |
| **GitHub Actions** (private repo) | Each job is billed in whole minutes on Linux runners. The **store monitor ≈ 720 min/month** at hourly runs. A release takes ~60–150 runner minutes (the build job waits for EAS; iOS review waits for processing). GitHub Free includes 2,000 private-repo minutes per month (Pro 3,000); check *Settings → Billing*. The monitor is set to hourly (`7 * * * *`, ≈ 720 min/month); set `STORE_STATUS_PAUSED=true` to pause it between releases. |
| Apple Developer Program | US$99/year (already paid). |
| Google Play developer | one-time US$25 (already paid). |
| ntfy.sh | Free tier (public topics, daily message limit far above this use). |
| fastlane | Free. |

---

## 6. Technical notes

- **Toolchain pins.** `eas.json` requires eas-cli `>= 27.4.0`; CI installs exactly `EAS_CLI_VERSION` (27.4.1 in `release.yml`) and fastlane `~> 2.241` (Gemfile). Bump them on purpose.
- **Platform requirements.** Expo SDK 58 builds with the iOS 26 SDK (Xcode 26), which App Store uploads require, and targets Android API 36, which Play requires. If Apple or Google raise the minimum, the upload fails with ACTION NEEDED "iOS SDK too old" / "Android target SDK".
- **EAS Submit vs review.** EAS Submit only uploads to **TestFlight**; fastlane `deliver` (API key, no Apple ID) does the App Review submission. On Android, EAS Submit with `releaseStatus: completed` commits the release and sends it to review (managed publishing off). Submit profiles: `production`, `production-draft`, `internal`, `internal-draft` (`eas.json`).
- **`ascAppId`.** eas-cli does not substitute env vars in `ascAppId`, so CI writes `ASC_APP_ID` into the working copy of `eas.json` right before `eas submit`. The committed file stays generic.
- **Secret files.** Secrets are written to `$RUNNER_TEMP/rotor-secrets` (mode 600, outside the repo), masked line by line with `::add-mask::`, and deleted at the end of each job. `.gitignore` also covers `*.p8`, service-account JSON, `.aab/.apk/.ipa` and fastlane outputs.
- **IDFA.** Apple removed the IDFA question from the submission API (fastlane ignores `add_id_info_uses_idfa` since 2.221). IDFA and tracking are declared only in App Privacy, and ATT is handled in the app.
- **1.0 has no ad SDK in the binary.** App Store Connect refuses "No data collected" when the binary contains an ad SDK or a tracking prompt (`STATE_ERROR.BINARY_INDICATES_APP_TRACKS_USERS`). So 1.0 leaves `react-native-google-mobile-ads` and `expo-tracking-transparency` out of native linking (`react-native.config.js`, `expo.autolinking.exclude` in `package.json`) and their plugins out of `app.json`. `src/services/ads.ts` loads `admob.ts` only when the native module is linked, so the same JS runs either way. To check what still blocks App Review at any time, run **App Store page setup** with mode `check-review` (it changes nothing).
- **iOS 1.0 has no RevenueCat either.** App Review (Guideline 2.1, 2026-11-16) asked for the ATT prompt because RevenueCat links AdServices and reads the ATT status. `react-native.config.js` unlinks `react-native-purchases` on iOS only (Android's fingerprint is unchanged). `src/services/purchases.ts` loads `revenuecat.ts` only when `RNPurchases` is linked. To sell on iOS (1.1): delete that entry, rebuild, and declare Purchases and Device ID usage in App Privacy as RevenueCat requires.
- **Turning ads on (1.1).** Delete the entry in `react-native.config.js` and the two names in `expo.autolinking.exclude`. Put `NSUserTrackingUsageDescription` back under `ios` in `locales/en.json` and `locales/fr.json` (removed for 1.0: a localized tracking text alone makes App Review expect the ATT prompt). Put back in `app.json` plugins (before `expo-build-properties`): `["react-native-google-mobile-ads", {"androidAppId": "<real ~ id>", "iosAppId": "<real ~ id>", "delayAppMeasurementInit": true, "userTrackingUsageDescription": "<FR text>"}]` and `["expo-tracking-transparency", {"userTrackingPermission": "<same text>"}]`. Fill `extra.ads` with the real unit IDs. Rebuild both apps, then before submitting: App Privacy (docs/store-forms.md §1, includes tracking), age rating `advertising: true`, Play Ads = Yes, Data safety and the Advertising ID declaration (remove AD_ID from `android.blockedPermissions`), and the privacy policy pages.
- **ITMS-90683 on 1.0 (expected, not blocking).** Apple emails "Missing purpose string: NSUserTrackingUsageDescription" for 1.0 builds. The only reference is RevenueCat's runtime lookup of `ATTrackingManager.trackingAuthorizationStatus` (string only; no ATT framework linked, no prompt, SDK never configured in 1.0), found with the **Inspect iOS build** workflow. Delivery and App Review are not affected. Don't add a tracking text to 1.0: that would contradict "No data collected". It goes away in 1.1, when the ATT text returns with ads.
