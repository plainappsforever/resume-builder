# Resume Builder

One profile, a resume for every job. Real-text PDF you can check. Offline.

Keep one profile. Make a tailored resume for every job. Export a PDF with real, selectable text, and see what the app read back from it. Everything stays on your phone: no account, no ads, no watermark, no subscription, no limit on resumes or exports.

**Get it:** [App Store](https://plainapps.dfdsfdsfsdf.workers.dev/apps/resume-builder/) · [Google Play](https://plainapps.dfdsfdsfsdf.workers.dev/apps/resume-builder/) · [GitHub Releases](https://github.com/plainappsforever/resume-builder/releases) ·
[Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/plainappsforever/resume-builder)

**Status:** first store release pending.

## Our promise

**Free, no ads, no tracking, no accounts.** This app keeps your data on your phone. It has no analytics, no crash
reporter, no advertising SDK and no sign-in. The Android release build has no INTERNET permission at all. We will not sell this app or this project to a company
that changes any of this.

Why we write it down: in 2023 a popular open-source Android suite was sold to an ad-funded app company and its store
listings started saying "Contains ads"; its community had to fork it to keep a clean version. The source code of
Resume Builder is published under GPL-3.0, so if this promise were ever broken, anyone could continue the last
version that kept it.

## What it does

One profile, many resumes
Type your details, jobs, education, skills and languages once. For each job, make a resume from your profile: show or hide entries and bullet points, change their order, and re-word a bullet for that one resume only. A new job added to your profile shows up in every resume, marked as new. If you like a change, apply it back to the profile.

Paste the job ad
Paste the text of an ad. The app lists words and phrases from it, with counts and a snippet, and shows which of them your resume has, has in other words, or lacks. For a missing one it tells you which hidden entries of your profile contain it, and you can include them with one tap. There is no score and no percentage: you see every word and why it is listed. Nothing leaves your phone.

A PDF you can check
Every PDF is made on your phone with real text, not a picture of text. Right after the export, the app reads the file back with an open-source PDF reader and shows the result in plain words: how many words and lines it found, whether the lines came back in the right order, the page count and the file size. That is what one reader found: it shows that the words are real text in a sensible order. It compares words, not every punctuation mark, so check your e-mail address and links in the PDF yourself. How a particular employer's system sorts a file into fields is not known, and the app does not claim to know. If the read-back cannot run on your phone, the app says "not checked" instead of a pass.

Structure checks with sources
Fifteen checks look at name and contact details, section titles, dates, bullet points, photo, symbols, links, file size and more. Each one says what it looked at and where the rule comes from (a recruiting-software vendor's help page, or common advice, labelled as such), and takes you to the place to fix it. Only a missing name stops an export.

Templates and layout
Six single-column templates (Classic, Modern, Compact, Executive, Lebenslauf, Plain) with no tables and nothing in headers or footers. A4 or Letter, text size, margins and spacing, "fit to one page" in one tap, an optional photo for German-style CVs, and English or German dates and headings per resume.

Cover letters
Write a cover letter in the same style for a company and a contact person, and export it through the same PDF and read-back path.

Help
Action verbs and bullet-point examples in English and German, a plain explanation of what ATS means, and an explanation of how every check and the keyword matching work.

Your data
Make a backup file and restore it on another phone, copy your resume as plain text for application forms, share an earlier export again, or delete all data. The backup file is readable text, not encrypted, and contains your personal details: keep it somewhere safe. The app has no network code and no internet permission. Data leaves your phone only when you share or print a file yourself. The app switches the phone's automatic app backup off.

Languages
The app is in English and German and follows your phone. Each resume can be in English or German.

Not in this version
- No AI writing and no cloud: the app does not rewrite your text.
- No import of an existing resume (PDF, Word or LinkedIn) and no Word export.
- No job tracker, no score, and no promise that an employer's system will read your file: nobody outside the vendor can know how it is set up.

## Privacy

- All data is stored locally (SQLite in the app's private storage). Nothing is uploaded.
- Files leave the phone only when you share or export them yourself.
- Privacy policy: https://plainapps.dfdsfdsfsdf.workers.dev/apps/resume-builder/privacy

## Build from source

The app identifier `com.tim.resumebuilder` is a placeholder: the identifier changes before the first store release.

You need: **Node.js 22 LTS** (the React Native version used here accepts `^20.19.4 || ^22.13.0 || ^24.3.0`), npm,
and git. The app is an [Expo](https://expo.dev) (SDK 57) / React Native app; the native `android/` and `ios/` folders
are generated from `app.config.ts` and are not in the repository.

```sh
git clone https://github.com/plainappsforever/resume-builder.git
cd resume-builder
npm ci
npm run verify          # typecheck + lint + all unit tests
```

### Android (Linux, macOS or Windows)

Needs JDK 17 and the Android SDK (Android Studio installs both; set `ANDROID_HOME`).

```sh
export APP_VARIANT=production
npx expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# APK: android/app/build/outputs/apk/release/ (signed with the debug key unless you configure your own key)
```

`APP_VARIANT` selects the app id and name (`development`, `preview`, `production`; see `app.config.ts`).
Builds made this way are signed with your key, not ours, so they cannot update an installed store version.

### iOS (macOS only)

Needs Xcode (26 or newer) and CocoaPods.

```sh
export APP_VARIANT=production
npx expo prebuild --platform ios
npx expo run:ios --configuration Release        # runs on the iOS Simulator
```

For a real iPhone, open `ios/*.xcworkspace` in Xcode, choose your own team under *Signing & Capabilities*
and change the bundle identifier. There is no sideloading store for iOS; the App Store build is ours.

## Verifying a release

Every GitHub release lists SHA-256 checksums (`SHA256SUMS.txt`) and the APKs are signed with one key per app.
Certificate SHA-256 fingerprint: `not yet published on Android`

## How this app was made

Resume Builder was written with substantial help from an AI coding assistant (Claude Code), directed, reviewed and
tested by the maintainer. We say this openly because some stores and users care about it.

## Licence

Copyright (C) 2026 Farija Retkoceri

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, version 3 (GPL-3.0-only). See [LICENSE](LICENSE).
Third-party components keep their own licences (see `LICENSES/` and the app's licences screen where present).
Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
