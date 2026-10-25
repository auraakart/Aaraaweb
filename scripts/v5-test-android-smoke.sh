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
  git restore -- "$APP/pubspec.yaml" "$APP/lib" "$APP/test" "$APP/pubspec.lock"
  rm -f "$APP/analysis_options.yaml" "$APP/test/widget_test.dart"
  python3 - "$APP" <<'PY'
from pathlib import Path
import re, sys
app = Path(sys.argv[1]) / "android" / "app"
android = app.parent
settings = [p for p in (android / "settings.gradle.kts", android / "settings.gradle") if p.is_file()]
if len(settings) != 1: raise SystemExit("One Android plugin settings file required")
plugins = settings[0].read_text()
def require_minimum(label, values, minimum):
    if len(values) != 1: raise SystemExit("One explicit " + label + " version required")
    version = tuple(int(part) for part in values[0].split("."))
    version = version + (0,) * (3-len(version))
    if version < minimum: raise SystemExit(label + " is below the reviewed share_plus toolchain minimum")
for plugin, minimum in (("com.android.application", (8,12,1)), ("org.jetbrains.kotlin.android", (2,2,0))):
    values = re.findall(r'''["']''' + re.escape(plugin) + r'''["']\s*\)?\s*version\s*["'](\d+\.\d+\.\d+)["']''', plugins)
    require_minimum(plugin, values, minimum)
wrapper = (android / "gradle" / "wrapper" / "gradle-wrapper.properties").read_text()
require_minimum("Gradle", re.findall(r"gradle-(\d+\.\d+(?:\.\d+)?)-(?:all|bin)\.zip", wrapper), (8,13,0))
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
mkdir -p dist
INFO="dist/aaraagate-$ROLE-test-apk-evidence.txt"
ENTRIES="dist/aaraagate-$ROLE-test-apk-entry-list.txt"
: > "$INFO"
log() { printf '%s\n' "$*" | tee -a "$INFO"; }
fail() {
  printf '::error title=Android TEST APK inspection::role=%s stage=%s: %s\n' "$ROLE" "$STAGE" "$*" >&2
  log "INSPECTION_FAILED role=$ROLE stage=$STAGE reason=$*"
  exit 1
}
STAGE="archive_exists"
[[ -s "$APK" ]] || fail 'build produced no APK'
{
  echo "role=$ROLE"
  echo "sha256=$(sha256sum "$APK" | cut -d' ' -f1)"
  echo "bytes=$(stat -c%s "$APK")"
  echo "source_commit=${GITHUB_SHA:-LOCAL}"
  echo 'runtime_image_attested=false'
  echo 'partner_manifest_bound=false'
  echo 'distribution_approved=false'
} >> "$INFO"
STAGE="zip_integrity"
unzip -tq "$APK" > /dev/null || fail 'APK ZIP integrity failed'
STAGE="zip_members"
zipinfo -1 "$APK" > "$ENTRIES" || fail 'Cannot enumerate APK ZIP members'
require_member() {
  if ! grep -Fxq "$1" "$ENTRIES"; then
    log "Available relevant entries:"
    grep -E '^(AndroidManifest.xml|classes[0-9]*.dex|lib/[^/]+/libflutter\.so)$' "$ENTRIES" | tee -a "$INFO" || true
    fail "Missing APK member $1"
  fi
}
require_member "AndroidManifest.xml"
require_member "classes.dex"
require_member "lib/arm64-v8a/libflutter.so"
STAGE="android_sdk_discovery"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[[ -n "$SDK" && -d "$SDK/build-tools" ]] || fail 'Android SDK build-tools root not found'
TOOLS="$(find "$SDK/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
[[ -n "$TOOLS" && -x "$TOOLS/aapt" && -x "$TOOLS/apksigner" ]] ||
  fail 'Android aapt/apksigner not executable in selected build-tools directory'
log "android_build_tools_version=$(basename "$TOOLS")"
STAGE="aapt_badging"
BADGE="dist/aaraagate-$ROLE-test-aapt-badging.txt"
"$TOOLS/aapt" dump badging "$APK" > "$BADGE" || fail 'aapt dump badging failed'
require_badge() {
  if ! grep -Fq "$1" "$BADGE"; then
    log "Actual aapt identity:"
    grep -E '^(package:|sdkVersion:|targetSdkVersion:|native-code:)' "$BADGE" | tee -a "$INFO" || true
    fail "aapt badging mismatch: $2"
  fi
}
STAGE="package_name"
require_badge "package: name='$PACKAGE'" "expected package $PACKAGE"
STAGE="min_sdk"
require_badge "sdkVersion:'24'" 'required minSdk 24'
STAGE="target_sdk"
require_badge "targetSdkVersion:'36'" 'required targetSdk 36'
STAGE="apksigner"
SIGNING="dist/aaraagate-$ROLE-test-apksigner.txt"
"$TOOLS/apksigner" verify --verbose --print-certs --min-sdk-version 24 "$APK" > "$SIGNING" ||
  fail 'apksigner cryptographic verification failed'
if ! grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$SIGNING"; then
  grep -E '^Verified using|^Number of signers:' "$SIGNING" | tee -a "$INFO" || true
  fail 'APK v2 signature scheme not verified'
fi
SIGNER_SUMMARY="dist/aaraagate-$ROLE-test-signing-summary.json"
node scripts/v5-test-apksigner-report.mjs "$SIGNING" > "$SIGNER_SUMMARY" ||
  fail 'No unique verified v2 signer and 64-character certificate SHA-256 digest'
log "INSPECTION_PASSED role=$ROLE sha256=$(sha256sum "$APK" | cut -d' ' -f1)"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### V5 base-app TEST debug APK: $ROLE"
    echo "- Source commit: ${GITHUB_SHA:-LOCAL}"
    echo "- SHA-256: $(sha256sum "$APK" | cut -d' ' -f1)"
    echo "- Expected package $PACKAGE, minSdk 24 and targetSdk 36"
    echo '- Local Android SDK signature accepted; **no attested partner distribution authority**'
  } >> "$GITHUB_STEP_SUMMARY"
fi
