#!/bin/sh
set -e

echo "[ci_post_clone] Repository: $CI_PRIMARY_REPOSITORY_PATH"
echo "[ci_post_clone] Branch: ${CI_BRANCH:-unknown}"
echo "[ci_post_clone] Build: ${CI_BUILD_NUMBER:-unknown}"

cd "$CI_PRIMARY_REPOSITORY_PATH"

# ── Node.js ────────────────────────────────────────────────────────────────
if ! command -v node > /dev/null 2>&1; then
  for nvm_node in \
    "/Users/local/.nvm/versions/node/$(ls /Users/local/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"; do
    if [ -x "$nvm_node/node" ]; then
      export PATH="$nvm_node:$PATH"
      break
    fi
  done
fi

if ! command -v node > /dev/null 2>&1; then
  echo "[ci_post_clone] node not found — installing via Homebrew..."
  brew install node@22
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

echo "[ci_post_clone] node: $(node -v)"
export NODE_BINARY=$(command -v node)

# ── npm ────────────────────────────────────────────────────────────────────
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
echo "[ci_post_clone] npm deps installed"

# ── CocoaPods ─────────────────────────────────────────────────────────────
if ! command -v pod > /dev/null 2>&1; then
  gem install --user-install cocoapods
  export PATH="$HOME/.gem/bin:$PATH"
fi

cd ios
export NODE_BINARY="$NODE_BINARY"
COCOAPODS_DISABLE_STATS=1 pod install --repo-update
echo "[ci_post_clone] pod install complete"

# ── Patch fmt 11.x consteval (Apple Clang 15+ / Xcode 15+) ────────────────
for FMT_HEADER in \
  "Pods/fmt/include/fmt/base.h" \
  "Pods/fmt/include/fmt/core.h" \
  "Pods/fmt/include/fmt/format.h"; do
  if [ -f "$FMT_HEADER" ]; then
    sed -i.bak 's/#  define FMT_USE_CONSTEVAL 1/#  define FMT_USE_CONSTEVAL 0/g' "$FMT_HEADER"
    sed -i.bak 's/#define FMT_USE_CONSTEVAL 1/#define FMT_USE_CONSTEVAL 0/g' "$FMT_HEADER"
    rm -f "${FMT_HEADER}.bak"
  fi
done

cp Podfile.lock Pods/Manifest.lock

PODS_XCCONFIG="Pods/Target Support Files/Pods-SocialPostAI_V2/Pods-SocialPostAI_V2.release.xcconfig"
if [ ! -f "$PODS_XCCONFIG" ]; then
  echo "[ci_post_clone] ERROR: $PODS_XCCONFIG not found after pod install"
  exit 1
fi

echo "[ci_post_clone] Done"
