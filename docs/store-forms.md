# Store forms: answers for Rotor

## Rotor 1.0: free launch (no ads, no purchases), exact answers

1.0 ships with ads switched off (the Google ad SDK is in the binary but never started), no in-app purchases (shop hidden), no analytics, no account, and all progress on the device. The answers below describe that build. Sections 1-6 further down are the drafts for 1.1, when AdMob and RevenueCat are switched on: update every form again before releasing 1.1.

Links: privacy policy https://sohi666.github.io/rotor/privacy.html (English: https://sohi666.github.io/rotor/en/privacy.html), support and marketing https://sohi666.github.io/rotor/ (English: .../rotor/en/).

### App Store Connect (one time, then the pipeline submits)

| Where | Answer |
|---|---|
| App Privacy → Get Started | **No, we do not collect data from this app** → Save → **Publish** |
| Pricing and Availability | Price **Free**; availability: all countries and regions (or Canada first) |
| Version 1.0 → App Review Information | Your first and last name, phone and email (only Apple sees them); Sign-in required: **No**. The pipeline uploads the review notes. |
| App Information → Content Rights | Set by the pipeline: contains third-party content (fonts under SIL OFL, instrument samples under MIT) and you have the rights |
| Age rating, category, description, keywords, screenshots, URLs | Uploaded by the pipeline (`fastlane/`) |
| In-App Purchases | None for 1.0 |

### Google Play Console → Dashboard → "Set up your app"

| Task | Answer |
|---|---|
| Privacy policy | https://sohi666.github.io/rotor/en/privacy.html |
| App access | All functionality is available without special access |
| Ads | **No, my app does not contain ads** |
| Content rating | Category **Game**. Violence, fear, sexuality, language, controlled substances, crude humour, gambling: **No**. Users interact or share content in the app: **No** (sharing the daily result uses the system share sheet). Digital purchases: **No**. Expected result: Everyone / PEGI 3 |
| Target audience | **13-15, 16-17, 18 and over**. Could the listing unintentionally appeal to children: **No** |
| News app | No |
| Data safety | Collects or shares any required user data types: **No** → Next → Save |
| Advertising ID | **No** (the 1.0 build removes the AD_ID permission) |
| Government apps / Financial features / Health | No / My app doesn't provide any financial features / No health features |
| Store settings | Category **Game → Puzzle**; contact email (required, shown publicly); website https://sohi666.github.io/rotor/ |
| Main store listing | Text and graphics are in `fastlane/metadata/android` (set the repository variable `PLAY_SYNC_LISTING=true` and the release uploads them) |
| Countries / regions | Production → Countries/regions → add all (or Canada first) |

Then run **Release** with `android_promote` = true: the tested internal-testing build is promoted to production and sent to Google review.

---

# 1.1 drafts (ads and purchases on)


> **DRAFT — confirm every answer before you submit it.** These are drafts, not legal advice. They assume the app uses **Google AdMob** (rewarded and end-of-level ads, App Tracking Transparency on iOS), **RevenueCat** with anonymous app user IDs (one "Remove ads" non-consumable, no login), a **privacy-friendly analytics** SDK that sends anonymous events with no advertising ID, and crash/diagnostic reporting. If the shipped app differs (another SDK, a login, cloud saves, precise location, a different analytics tool), change the answers. Check each SDK's current disclosure page:
> - Google Mobile Ads: https://developers.google.com/admob/ios/privacy/data-disclosure and the Play "data disclosure" page for Android
> - RevenueCat: https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy
>
> The privacy policy (TODO URL in `fastlane/metadata/*/privacy_url.txt`) must say the same things as these forms. In Québec it must also name the person in charge of personal information (Law 25).

---

## 1. App Store Connect → App Privacy

**Get Started → "Do you or your third-party partners collect data from this app?" → Yes.** Then add exactly these data types.

| Category → Data type | Collected by | Purposes (tick) | Linked to the user? | Used for tracking? |
|---|---|---|---|---|
| Identifiers → **Device ID** | AdMob (IDFA once ATT is allowed; vendor/app-scoped IDs) | Third-Party Advertising, Analytics | **Yes** | **Yes** |
| Usage Data → **Advertising Data** | AdMob (ads seen, taps) | Third-Party Advertising, Analytics | **Yes** | **Yes** |
| Usage Data → **Product Interaction** | AdMob (launches, taps, video views) + analytics (level events) | Third-Party Advertising, Analytics, App Functionality | **Yes** (because AdMob ties it to the device ID) | **Yes** |
| Location → **Coarse Location** | AdMob (estimated from the IP address) | Third-Party Advertising, Analytics | **Yes** | **Yes** |
| Diagnostics → **Crash Data** | crash reporter + AdMob | App Functionality, Analytics | No | No |
| Diagnostics → **Performance Data** | AdMob (launch time, hang rate) + crash reporter | App Functionality, Analytics, Third-Party Advertising | **Yes** (Google calls it "user-associated") | No |
| Diagnostics → **Other Diagnostic Data** | AdMob / crash reporter | App Functionality, Analytics | No | No |
| Purchases → **Purchase History** | RevenueCat (anonymous ID) | App Functionality, Analytics | **No**, as long as RevenueCat IDs stay anonymous with no account or email | No |

**Not collected:** contact info, health and fitness, financial info (Apple and Google process the payment), precise location, sensitive info, contacts, user content, browsing history, search history, User ID (unless you start passing a custom RevenueCat user ID), other data.

Why these choices:
- Declaring **tracking** means the app must show the ATT prompt before any tracking. It needs `NSUserTrackingUsageDescription` in French and English. If the user declines, AdMob must only request non-personalized ads. These answers describe what can happen when the user allows tracking, which is what Apple asks for.
- If the analytics SDK is replaced by one that uses an advertising identifier or fingerprinting, it becomes tracking too.
- After saving, press **Publish** on the App Privacy page. The review submission fails until you do (ACTION NEEDED "App Privacy questionnaire").
- The Google Mobile Ads SDK ships its own privacy manifest. Check that the built app's `PrivacyInfo.xcprivacy` (Expo `ios.privacyManifests`) covers the required-reason APIs used by the app's own code.

### Other App Store answers (the pipeline sends some of these; check them once in App Store Connect)
- **Age rating** (`fastlane/app_rating_config.json`, uploaded by deliver): every content question NONE, gambling and loot boxes No, no user-generated content, no messaging/chat, no unrestricted web access, no parental controls or age assurance, **Advertising: Yes**. The expected result is **4+** (confirm on the summary). Apple adds questions from time to time; if a submission fails with "age rating", compare the JSON with the questionnaire.
- **Ads must suit the rating** (Guideline 2.3.8). Set **AdMob → Apps → Rotor → Blocking controls → Max ad content rating = G** (and `maxAdContentRating: G` in the SDK request configuration). Alternatively, set the age rating to 9+ (`ageRatingOverrideV2: "NINE_PLUS"`) and allow PG. **Decision needed.**
- **Made for Kids:** No.
- **Export compliance:** the app uses only standard HTTPS through the OS, so it has no non-exempt encryption. Set `ios.config.usesNonExemptEncryption: false` in `app.json` (`ITSAppUsesNonExemptEncryption = NO`); the pipeline also answers "No" at submission.
- **Content rights:** "Does not contain, show, or access third-party content." Fonts are Google Fonts under the OFL and ship as licensed assets. Change the answer if levels, art or music come from someone else.
- **App Review notes:** in `fastlane/metadata/review_information/notes.txt`; no demo account needed. Add the contact name, phone and email once in App Store Connect.

---

## 2. Google Play Console → Policy and programs → App content → Data safety

**Data collection and security**
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (TLS)
- Do you provide a way for users to request that their data is deleted? **Yes.** Requests go by email to the privacy contact in the privacy policy (Law 25 requires handling them anyway). Users reset or delete the advertising ID in Android settings, and you can delete the RevenueCat customer. If you don't want to offer this, answer No; it is allowed for apps without accounts.

**Data types** (an SDK that processes data *on your behalf*, like RevenueCat or the analytics service, counts as **collected, not shared**; AdMob uses data for Google's own ad network, so it is **shared**)

| Data type | Collected | Shared | Processed ephemerally? | Required/optional | Purposes |
|---|---|---|---|---|---|
| Location → **Approximate location** | Yes (AdMob, from IP) | **Yes** (AdMob) | No | Required | Advertising or marketing, Analytics, Fraud prevention/security/compliance |
| App activity → **App interactions** | Yes | **Yes** (AdMob) | No | Required | Analytics, Advertising or marketing, App functionality, Fraud prevention |
| App info and performance → **Crash logs** | Yes | Yes (AdMob) | No | Required | App functionality, Analytics |
| App info and performance → **Diagnostics** | Yes | Yes (AdMob) | No | Required | App functionality, Analytics, Advertising or marketing |
| Device or other IDs → **Device or other IDs** | Yes (ad ID, app set ID) | **Yes** (AdMob) | No | Required* | Advertising or marketing, Analytics, Fraud prevention |
| Financial info → **Purchase history** | Yes (RevenueCat) | No | No | Required | App functionality, Analytics |

\* Google calls ad-ID collection "optional" because users can delete the ID. "Required" is the safer answer for the app-set ID.

**Not collected:** personal info (name, email, user IDs), financial payment info, health, messages, photos, audio, files, calendar, contacts, web history, precise location.

**Permissions check before answering.** With its defaults, the `expo-audio` config plugin (SDK 58) adds:
- Android: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Play then asks for a foreground-service declaration, and a microphone permission contradicts "no audio collected".
- iOS: a microphone usage string and `UIBackgroundModes: audio`. Apple rejects background audio that isn't used (Guideline 2.5.4).

Configure it as `["expo-audio", { "microphonePermission": false, "recordAudioAndroid": false, "enableBackgroundPlayback": false }]` in `app.json`.

**Advertising ID declaration** (App content → Advertising ID): **Yes, my app uses advertising ID**, for Advertising or marketing, Analytics and Fraud prevention. The Google Mobile Ads SDK merges the `com.google.android.gms.permission.AD_ID` permission; check that it is in the built manifest.

---

## 3. Google Play → App content → Content rating (IARC questionnaire)

- Email: your developer contact. **Category: Game.**
- Violence: **No** to all. Fear/horror: **No**. Sexuality/nudity: **No**. Language/profanity: **No**. Crude humour: **No**. Controlled substances (drugs, alcohol, tobacco): **No**.
- Gambling: simulated gambling **No**; real-money gambling **No**.
- **Users interact or exchange content** (chat, voice, sharing photos/video with other users) inside the app: **No**. The spoiler-free result goes through the phone's share sheet to other apps; there is no in-app communication.
- Shares the user's physical location with other users: **No**.
- **Digital purchases: Yes** (one-time "Remove ads").
- Randomized paid items, loot boxes, NFTs: **No**.
- Unrestricted internet or web browser: **No**.

Expected result: everyone or 3+ in each region (ESRB Everyone, PEGI 3), with the "In-App Purchases" interactive element.

---

## 4. Google Play → App content → Target audience and content

- **Target age groups: 13–15, 16–17, 18 and over.** Do **not** tick any under-13 group.
  - Why: an under-13 group puts the app under the Families policy. That means Families-certified ad SDK settings only, child-directed ad requests, stricter reviews, and no advertising-ID use for kids. A minimal abstract puzzle doesn't need that.
- "Could your store listing unintentionally appeal to children?" **No.** The art is abstract with no cartoon characters and the copy talks about logic and par. Google may still decide otherwise; if it does, either adjust the listing or comply with Families.
- Keep the AdMob max ad content rating consistent (G or PG, see the App Store section).

## 5. Other Play App content answers

| Section | Answer |
|---|---|
| **Ads** | **Yes, my app contains ads** (AdMob rewarded and end-of-level) |
| **App access** | **All functionality is available without any access restrictions** (no login) |
| Privacy policy | the TODO URL in `fastlane/metadata/fr-CA/privacy_url.txt` once it is live |
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health | My app does not have any health features |
| News app | No |
| Data safety | section 2 |
| Store settings | Category **Game → Puzzle**; tags: Puzzle, Logic, Casual (pick from Google's list); contact email; website = the domain that hosts `app-ads.txt` |

## 6. Store listing languages (Québec)

- French (Canada) is the **primary or default language** on both stores (Charter of the French Language). English (United States) is the second listing. Texts are in `fastlane/metadata/{fr-CA,en-US}` and `fastlane/metadata/android/{fr-CA,en-US}`.
- The in-app default language for Québec users should be French. That is up to the app; `expo-localization` is installed.
