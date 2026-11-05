#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/opt/android}
BT="$SDK/android-14"
AJ="$SDK/android-34/android.jar"
Q="qemu-amd64-static -L /opt/amd64"
AAPT2="$Q $BT/aapt2"
OUT=build
rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

echo "[1/6] aapt2 compile"
$AAPT2 compile --dir res -o "$OUT/res.zip"
echo "[2/6] aapt2 link"
$AAPT2 link -o "$OUT/base.apk" -I "$AJ" --manifest AndroidManifest.xml \
  -R "$OUT/res.zip" --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 --auto-add-overlay

echo "[3/6] javac"
find java "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
if ! javac -encoding UTF-8 -source 8 -target 8 -nowarn -classpath "$AJ" \
  -d "$OUT/classes" @"$OUT/sources.txt" > "$OUT/javac.log" 2>&1; then
  cat "$OUT/javac.log"; exit 1
fi
grep -v 'bootstrap class path' "$OUT/javac.log" || true

echo "[4/6] d8"
(cd "$OUT/classes" && jar cf ../classes.jar .)
"$BT/d8" --release --lib "$AJ" --min-api 24 --output "$OUT/dex" "$OUT/classes.jar"

echo "[5/6] package"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)
zip -qr "$OUT/unsigned.apk" assets
$Q "$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "[6/6] sign"
KS=debug.keystore
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias androiddebugkey -storepass android \
    -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=CourseNav Debug,O=CourseNav,C=CN" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out CourseNav.apk "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs CourseNav.apk | head -4
ls -lh CourseNav.apk
