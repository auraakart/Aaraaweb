#!/usr/bin/env bash
set -euo pipefail
ROLE="$1"
case "$ROLE" in resident|guard) ;; *) echo "Invalid TEST role" >&2; exit 1;; esac
AAB="apps/$ROLE/build/app/outputs/bundle/debug/app-debug.aab"
mkdir -p dist
INFO="dist/aaraagate-$ROLE-test-aab-evidence.txt"
JAR_REPORT="dist/aaraagate-$ROLE-test-aab-jarsigner.txt"
CERT_REPORT="dist/aaraagate-$ROLE-test-aab-certificate.txt"
: > "$INFO"
fail(){ echo "::error title=AAB TEST smoke::$ROLE $1" >&2; echo "FAILED: $1" >> "$INFO"; exit 1; }
[[ -s "$AAB" ]] || fail "missing real debug AAB at $AAB"
{
 echo "role=$ROLE"
 echo "environment=TEST"
 echo "sha256=$(sha256sum "$AAB" | cut -d' ' -f1)"
 echo "bytes=$(stat -c%s "$AAB")"
 echo "source_commit=$GITHUB_SHA"
 echo "external_image_attested=false"
 echo "partner_manifest_bound=false"
 echo "signer_independently_pinned=false"
 echo "distribution_approved=false"
} >> "$INFO"
unzip -tq "$AAB" > /dev/null || fail "AAB ZIP integrity"
ENTRIES="dist/aaraagate-$ROLE-test-aab-entry-list.txt"
zipinfo -1 "$AAB" > "$ENTRIES" || fail "AAB inventory"
for member in BundleConfig.pb base/manifest/AndroidManifest.xml base/dex/classes.dex base/lib/arm64-v8a/libflutter.so; do
 grep -Fxq "$member" "$ENTRIES" || fail "missing AAB member $member"
done
command -v jarsigner >/dev/null || fail "missing JDK jarsigner"
command -v keytool >/dev/null || fail "missing JDK keytool"
jarsigner -verify -verbose -certs "$AAB" > "$JAR_REPORT" 2>&1 || fail "JAR cryptographic verification"
keytool -printcert -jarfile "$AAB" > "$CERT_REPORT" 2>&1 || fail "JAR signer certificate extraction"
node scripts/v5-test-aab-signer-report.mjs "$JAR_REPORT" "$CERT_REPORT" > "dist/aaraagate-$ROLE-test-aab-signing-summary.json" ||
 fail "AAB signature report failed unique signer/certificate or signed member checks"
echo "PASSED real base $ROLE AAB JAR verification" >> "$INFO"
if [[ -n "$GITHUB_STEP_SUMMARY" ]]; then
 {
  echo "### TEST base $ROLE AAB"
  echo "- SHA-256: $(sha256sum "$AAB" | cut -d' ' -f1)"
  echo "- Debug signer observed locally; no partner or attested runner authority"
 } >> "$GITHUB_STEP_SUMMARY"
fi
