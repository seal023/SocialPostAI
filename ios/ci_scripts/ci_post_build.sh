#!/bin/sh
set -eu

echo "[ci_post_build] Build: ${CI_BUILD_NUMBER:-unset}"
echo "[ci_post_build] Product: ${CI_PRODUCT:-unset}"
echo "[ci_post_build] Workflow: ${CI_WORKFLOW:-unset}"

if [ -n "${CI_ARCHIVE_PATH:-}" ]; then
  echo "[ci_post_build] Archive: $CI_ARCHIVE_PATH"
fi

if [ -n "${CI_TESTFLIGHT_BUILD_NUMBER:-}" ]; then
  echo "[ci_post_build] TestFlight build: $CI_TESTFLIGHT_BUILD_NUMBER"
fi

echo "[ci_post_build] Done"
