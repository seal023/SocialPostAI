#!/bin/sh
set -e

echo "[ci_pre_xcodebuild] Build: ${CI_BUILD_NUMBER:-unset}"

cd "$CI_PRIMARY_REPOSITORY_PATH"
IOS_DIR="$CI_PRIMARY_REPOSITORY_PATH/ios"

# Detect generated project name dynamically (no hardcoding — survives renames).
PROJECT_NAME=$(ls "$IOS_DIR"/*.xcodeproj 2>/dev/null | head -n1 | sed 's#.*/##; s#\.xcodeproj$##')
if [ -z "$PROJECT_NAME" ]; then
  echo "[ci_pre_xcodebuild] ERROR: no .xcodeproj found in $IOS_DIR"
  exit 1
fi
echo "[ci_pre_xcodebuild] Project name: $PROJECT_NAME"

PODS_XCCONFIG="$IOS_DIR/Pods/Target Support Files/Pods-${PROJECT_NAME}/Pods-${PROJECT_NAME}.release.xcconfig"
if [ ! -f "$PODS_XCCONFIG" ]; then
  echo "[ci_pre_xcodebuild] ERROR: Pods xcconfig missing: $PODS_XCCONFIG"
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
