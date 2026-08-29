#!/bin/sh
set -e
set -x

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

echo "=== PWD: $(pwd) ==="
echo "=== Node setup ==="

brew install node@22 || true
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -v
npm -v

npm ci

echo "=== Expo prebuild ==="
npx expo prebuild -p ios --clean --no-install

echo "=== Pod install ==="
cd ios
pod install --repo-update

echo "=== POST CLONE DONE ==="