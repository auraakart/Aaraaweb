# V4.91.5 — Demo APK download visibility and integrity

## Observed on 2026-10-11

The GitHub [resident-demo-latest release](https://github.com/auraakart/Aaraaweb/releases/tag/resident-demo-latest) contained an uploaded `.apk` (160,619,451 bytes, about 153 MiB), labeled `application/vnd.android.package-archive`. The release build check succeeded. GitHub reported zero recorded downloads at inspection, which does **not** establish whether this user's download was interrupted or cached by the browser. Device/browser download-manager evidence was not available, and an APK is not shown in the Android app drawer before installation.

## Bounded engineering remediation

- Change the generated wrapper build from **debug** to **universal release-mode demo** (still demo/debug-signed, not Play Store-signed), preserving `AARAGATE_DEMO_MODE=true` and all showcase data.
- Preserve the existing stable APK release URL and filename so prior links remain valid.
- Validate APK as an intact ZIP containing an Android manifest, DEX and ARM64 Flutter engine. A nonempty artifact is insufficient.
- Record immutable build SHA, version, size and SHA-256 in the build job summary; retain the correct APK content type in release metadata.
- Run the actual APK packaging workflow when the workflow changes on a develop PR. The release upload remains **main-push only**.
- Update the release instructions for Chrome, Android Downloads, installation and demo-signature conflicts.

**This is an artifact-delivery improvement, not proof of phone-specific root cause.** Release completion requires a separately authorized protected staging/main promotion and verification that the stable GitHub asset is refreshed and the APK build/integrity checks pass. Do not claim the older asset is fixed before that.

## Android installation

1. Open [GitHub Releases](https://github.com/auraakart/Aaraaweb/releases/tag/resident-demo-latest) in Chrome (outside embedded chat browsers) and expand **Assets**.
2. Download `Aaraagate-Resident-Demo-Showcase-V2.apk`. Open Chrome menu → Downloads, or Files / File Manager → Downloads and search for `Aaraagate` or `.apk`.
3. Tap the downloaded file and select **Install**. If prompted, grant Chrome or Files permission to install unknown apps for this trusted download.
4. Ensure there is enough free storage for the APK and app extraction. A temporary `.crdownload` is not an installable package.
5. If Android reports an app-signature conflict with a previous demo, back up needed local data before removing the old demo. Different CI demo signing keys may prevent in-place upgrades.
6. If the file still does not appear, collect the phone browser/download notification and Files listing. Those details are needed to diagnose app-scoped storage versus interrupted transfer.

**Out of scope:** hosted delivery service, production signing, Play Store, real-device test certification, API changes, new features and bypassing staging/main review.
