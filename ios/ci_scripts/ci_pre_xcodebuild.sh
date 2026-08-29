#!/bin/sh
set -e

echo "[ci_pre_xcodebuild] Build: ${CI_BUILD_NUMBER:-unset}"

cd "$CI_PRIMARY_REPOSITORY_PATH"
IOS_DIR="$CI_PRIMARY_REPOSITORY_PATH/ios"

PODS_XCCONFIG="$IOS_DIR/Pods/Target Support Files/Pods-SocialPostAI_V2/Pods-SocialPostAI_V2.release.xcconfig"
if [ ! -f "$PODS_XCCONFIG" ]; then
  echo "[ci_pre_xcodebuild] ERROR: Pods xcconfig missing"
  exit 1
fi

if diff "$IOS_DIR/Podfile.lock" "$IOS_DIR/Pods/Manifest.lock" > /dev/null 2>&1; then
  echo "[ci_pre_xcodebuild] Manifest.lock ok"
else
  echo "[ci_pre_xcodebuild] Manifest.lock differs — re-syncing"
  cp "$IOS_DIR/Podfile.lock" "$IOS_DIR/Pods/Manifest.lock"
fi

if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  cd "$IOS_DIR"
  xcrun agvtool new-version -all "$CI_BUILD_NUMBER"
fi

echo "[ci_pre_xcodebuild] Done"
