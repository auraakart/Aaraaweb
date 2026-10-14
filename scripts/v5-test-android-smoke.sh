#!/usr/bin/env bash
set -euo pipefail
ACTION="$1"
ROLE="$2"
case "$ROLE" in resident|guard) ;; *) echo 'Unknown TEST role' >&2; exit 1;; esac
case "$ACTION" in prepare|inspect) ;; *) echo 'Unknown TEST action' >&2; exit 1;; esac
APP="apps/$ROLE"
APK="$APP/build/app/outputs/flutter-apk/app-debug.apk"
PACKAGE="com.aaraaplatforms.aaraagate_$ROLE"
if [[ "$ACTION" == "prepare" ]]; then
  git restore -- "$APP/pubspec.yaml" "$APP/lib" "$APP/test"
  rm -f "$APP/analysis_options.yaml" "$APP/test/widget_test.dart"
  python3 - "$APP" <<'PY'
from pathlib import Path
import re, sys
app = Path(sys.argv[1]) / "android" / "app"
candidates = [app / "build.gradle.kts", app / "build.gradle"]
present = [p for p in candidates if p.is_file()]
if len(present) != 1: raise SystemExit("One Android Gradle app file required")
path = present[0]; value = path.read_text()
for name, sdk in (("compileSdk",36),("minSdk",24),("targetSdk",36)):
    pattern = rf"(?m)^(\s*){name}(?:Version)?\s*(?:=\s*)?flutter\.{name}Version\s*$"
    matched = re.findall(pattern,value)
    if len(matched) != 1: raise SystemExit(f"Unsupported generated {name} declaration")
    value,count = re.subn(pattern,lambda match:match.group(1)+name+" = "+str(sdk),value)
    if count != 1: raise SystemExit("Ambiguous "+name)
path.write_text(value)
PY
  exit 0
fi
[[ -s "$APK" ]] || { echo 'Missing TEST debug APK' >&2; exit 1; }
unzip -tq "$APK" > /dev/null
mkdir -p dist
zipinfo -1 "$APK" > "dist/aaraagate-$ROLE-test-apk-entry-list.txt"
grep -Fxq 'AndroidManifest.xml' "dist/aaraagate-$ROLE-test-apk-entry-list.txt"
grep -Fxq 'classes.dex' "dist/aaraagate-$ROLE-test-apk-entry-list.txt"
grep -Fxq 'lib/arm64-v8a/libflutter.so' "dist/aaraagate-$ROLE-test-apk-entry-list.txt"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$SDK" ]]; then echo 'Android SDK missing' >&2; exit 1; fi
TOOLS="$(find "$SDK/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
[[ -n "$TOOLS" && -x "$TOOLS/aapt" && -x "$TOOLS/apksigner" ]] || {
  echo 'Missing Android inspection executables' >&2; exit 1;
}
mkdir -p dist
INFO="dist/aaraagate-$ROLE-test-apk-evidence.txt"
"$TOOLS/aapt" dump badging "$APK" > "$INFO"
grep -Fq "package: name='$PACKAGE'" "$INFO"
grep -Fq "sdkVersion:'24'" "$INFO"
grep -Fq "targetSdkVersion:'36'" "$INFO"
"$TOOLS/apksigner" verify --verbose --print-certs --min-sdk-version 24 "$APK" >> "$INFO"
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$INFO"
grep -Fq 'Signer #1 certificate SHA-256 digest:' "$INFO"
{
  echo "role=$ROLE"
  echo "sha256=$(sha256sum "$APK" | cut -d' ' -f1)"
  echo "bytes=$(stat -c%s "$APK")"
  echo "source_commit=$GITHUB_SHA"
  echo 'runtime_image_attested=false'
  echo 'partner_manifest_bound=false'
  echo 'distribution_approved=false'
} >> "$INFO"
cp "$APK" "dist/aaraagate-$ROLE-TEST-debug.apk"
if [[ -n "$GITHUB_STEP_SUMMARY" ]]; then
  {
    echo "### V5 base-app Android TEST debug APK: $ROLE"
    echo "- Source commit: $GITHUB_SHA"
    echo "- SHA-256: $(sha256sum "$APK" | cut -d' ' -f1)"
    echo "- Package: $PACKAGE; minSdk 24; targetSdk 36"
    echo '- Local SDK v2 signature check passed; **trusted runner attestation and partner distribution not established**'
  } >> "$GITHUB_STEP_SUMMARY"
fi
