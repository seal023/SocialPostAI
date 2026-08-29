#!/bin/sh
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "== install Node 22 LTS =="
brew install node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -v

echo "== npm ci =="
npm ci

echo "== expo prebuild ios (clean) =="
CI="true" npx expo prebuild -p ios --clean --no-install

echo "== pod install =="
cd ios
pod install
cd ..

echo "== done =="