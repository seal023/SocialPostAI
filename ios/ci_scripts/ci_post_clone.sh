#!/bin/bash
#
# Xcode Cloud post-clone script - SocialPostAI Pro (Expo prebuild / React Native)
#
# WHY THIS FILE LIVES IN ios/ci_scripts AND NOT AT THE REPOSITORY ROOT:
#   Xcode Cloud only picks up custom build scripts when the ci_scripts directory
#   sits in the SAME directory as the .xcodeproj / .xcworkspace selected by the
#   workflow. For this project the workflow builds ios/SocialPostAIPro.xcworkspace,
#   so ci_scripts must be ios/ci_scripts. A ci_scripts folder at the repo root is
#   silently ignored, which is why expo prebuild / pod install never ran and every
#   build died at "Resolve Package Dependencies" with:
#     Workspace SocialPostAIPro.xcworkspace does not exist at ios/SocialPostAIPro.xcworkspace
#
set -e

echo "===== Xcode Cloud ci_post_clone start ====="

# Xcode Cloud launches this script with ci_scripts/ as the working directory.
cd "${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
echo "[ci] repo root: $(pwd)"

# Xcode Cloud exports CI=TRUE, which some Expo/RN tooling rejects
# ("Error: GetEnv.NoBoolean: TRUE is not a boolean"). Force the accepted value.
export CI=true

# ---- Node (the Xcode Cloud macOS image may not ship the version we need) ----
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node -v
npm -v

# ---- Install JS deps ----
npm ci || npm install

# ---- Run the iOS 26 crash patches explicitly (idempotent) ----
# package.json postinstall normally does this, but we re-run the chain here so a
# build can never continue with unpatched native code (e.g. if a future npm
# version skips lifecycle scripts, or postinstall fails silently).
echo "[ci] applying crash patches..."
node scripts/patch-rniap.js
node scripts/patch-rniap-ios-init.js
node scripts/patch-rct-fatal-handler.js

# ---- FAIL LOUD if the critical crash patches did NOT apply ----
# IMPORTANT - the marker strings differ per patch file:
#   scripts/patch-rniap-ios-init.js  writes  "// [iOS 26 crash fix]"
#   scripts/patch-rct-fatal-handler.js writes "// [SocialPostAI crash fix]"
# Build 30 aborted here because it grepped RNIapIos.swift for
# "SocialPostAI crash fix" - a string that patch never writes - so the check
# could never pass even on a correctly patched tree. Keep these in sync with
# the scripts/ files if the markers are ever renamed.
echo "[ci] verifying crash patches were applied..."
if [ -f node_modules/react-native-iap/ios/RNIapIos.swift ]; then
  if grep -q "iOS 26 crash fix" node_modules/react-native-iap/ios/RNIapIos.swift; then
    echo "[ci] OK: RNIapIos.swift StoreKit patch present"
  else
    echo "ERROR: react-native-iap StoreKit patch NOT applied"
    grep -n "crash fix" node_modules/react-native-iap/ios/RNIapIos.swift || true
    exit 1
  fi
else
  echo "WARN: RNIapIos.swift not found (react-native-iap may have changed)"; fi

if [ -f node_modules/react-native/React/Base/RCTAssert.m ]; then
  if grep -q "SocialPostAI crash fix" node_modules/react-native/React/Base/RCTAssert.m; then
    echo "[ci] OK: RCTAssert.m @throw patch present"
  else
    echo "ERROR: RCTFatal @throw patch NOT applied"
    grep -n "crash fix" node_modules/react-native/React/Base/RCTAssert.m || true
    exit 1
  fi
else
  echo "WARN: RCTAssert.m not found (react-native may have changed)"; fi

# ---- API key for Bailian / qwen (EXPO_PUBLIC_* are inlined at build time) ----
# Prefer Xcode Cloud workflow environment variables; fall back to inline key.
if [ -z "$EXPO_PUBLIC_BAILIAN_API_KEY" ]; then
  EXPO_PUBLIC_BAILIAN_API_KEY="sk-746292e90c864a959c48e36e23b9912f"
  EXPO_PUBLIC_DASHSCOPE_API_KEY="sk-746292e90c864a959c48e36e23b9912f"
fi
printf 'EXPO_PUBLIC_BAILIAN_API_KEY=%s\nEXPO_PUBLIC_DASHSCOPE_API_KEY=%s\n' \
  "$EXPO_PUBLIC_BAILIAN_API_KEY" "$EXPO_PUBLIC_DASHSCOPE_API_KEY" > .env
echo "[ci] .env written"

# ---- Clear any stale native project before regenerating it ----
# NOTE: we deliberately do NOT use "expo prebuild --clean". It deletes the whole
# ios/ directory, including this very script, which corrupts the running shell
# script. This removes exactly what --clean would, minus ci_scripts/.
find ios -mindepth 1 -maxdepth 1 -not -name ci_scripts -exec rm -rf {} +

# ---- Generate the native ios/ project from app.json ----
# app.json name "SocialPostAI Pro" -> sanitizedName "SocialPostAIPro", which is
# exactly the project / workspace / scheme name the Xcode Cloud workflow expects.
# --no-install: skip prebuild's built-in `pod install` (it runs without
# --repo-update and would fail on a stale CocoaPods spec repo); we install the
# pods ourselves a few lines below, where we can retry with --repo-update.
npx expo prebuild --platform ios --no-install

PROJ=$(ls -d ios/*.xcodeproj 2>/dev/null | head -1)
if [ -z "$PROJ" ]; then
  echo "ERROR: expo prebuild did not generate ios/*.xcodeproj"
  ls -la ios
  exit 1
fi
echo "[ci] generated Xcode project: $PROJ"

# ---- Set a UNIQUE, INCREASING build number so TestFlight accepts every upload ----
# If app.json has no ios.buildNumber, expo prebuild writes CURRENT_PROJECT_VERSION = 1,
# which makes every Xcode Cloud build upload the same "1.0.0 (1)" and App Store Connect
# REJECTS the duplicate - so new fixes never reach TestFlight.
BUILD_NUM="${CI_BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
echo "[ci] setting CURRENT_PROJECT_VERSION = $BUILD_NUM"
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD_NUM;/g" \
  "$PROJ/project.pbxproj"

# ---- Safety: make sure the Bundle ID matches app.json ----
sed -i '' 's/com\.seal023\.SocialPostAI\.20260815-/com.seal023.SocialPostAI.20260816/g' \
  "$PROJ/project.pbxproj"

# ---- CocoaPods (ships with the Xcode Cloud image; install only if missing) ----
if ! command -v pod >/dev/null 2>&1; then
  gem install cocoapods -v 1.15.2 -N || true
fi
pod --version
( cd ios && pod install --repo-update )

# ---- Last-mile guarantee: the exact container the workflow asks for ----
# The Xcode Cloud workflow is configured with workspace "SocialPostAIPro.xcworkspace"
# and scheme "SocialPostAIPro". Normally prebuild + pod install produce exactly that.
# If Expo ever changes its name derivation, we create the expected container rather
# than failing the build with a confusing "workspace does not exist" error.
EXPECTED="SocialPostAIPro"
cd ios
if [ ! -d "$EXPECTED.xcworkspace" ]; then
  echo "[ci] WARN: $EXPECTED.xcworkspace missing - creating it around $PROJ"
  mkdir -p "$EXPECTED.xcworkspace"
  printf '<?xml version="1.0" encoding="UTF-8"?>\n<Workspace version = "1.0">\n  <FileRef location = "group:%s"/>\n  <FileRef location = "group:Pods/Pods.xcodeproj"/>\n</Workspace>\n' \
    "$(basename "$PROJ")" > "$EXPECTED.xcworkspace/contents.xcworkspacedata"
fi
PROJ_DIR=$(basename "$PROJ")
SCHEME_DIR="$PROJ_DIR/xcshareddata/xcschemes"
if [ -d "$SCHEME_DIR" ] && [ ! -f "$SCHEME_DIR/$EXPECTED.xcscheme" ]; then
  FIRST_SCHEME=$(ls "$SCHEME_DIR"/*.xcscheme 2>/dev/null | head -1)
  if [ -n "$FIRST_SCHEME" ]; then
    cp "$FIRST_SCHEME" "$SCHEME_DIR/$EXPECTED.xcscheme"
    echo "[ci] WARN: created shared scheme $EXPECTED.xcscheme from $FIRST_SCHEME"
  fi
fi
echo "[ci] ios/ contents after setup:"
ls -1
echo "[ci] workspaces: $(ls -d *.xcworkspace 2>/dev/null | tr '\n' ' ')"
echo "[ci] schemes:    $(ls -1 "$SCHEME_DIR" 2>/dev/null | tr '\n' ' ')"
cd ..

echo "===== Xcode Cloud ci_post_clone done ====="
