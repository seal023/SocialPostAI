/**
 * patch-rct-fatal-handler.js
 * --------------------------------------------
 * iOS 26 + RN 0.83 + Release crash fix (native level).
 *
 * Problem: In Release builds, RCTFatal() throws an NSException when no custom
 * fatal handler is set. This exception propagates through
 * ObjCTurboModule::performVoidMethodInvocation → objc_exception_rethrow →
 * std::terminate → abort() → SIGABRT crash.
 *
 * JS-level patches (overwriting ExceptionsManager.reportException on the
 * TurboModule proxy) do NOT work because TurboModule proxies are JSI-backed
 * objects with non-writable method properties.
 *
 * Fix: Replace the @throw in RCTFatal() and RCTFatalException() with a no-op
 * that logs and persists the error to a file. This directly prevents the
 * throw → rethrow → terminate → abort chain at the source.
 *
 * The persisted error is written to Documents/rct_fatal_log.json and read
 * by App.js via expo-file-system for diagnostic display.
 *
 * Idempotent: safe to run repeatedly.
 * Runs automatically via `postinstall` (see package.json) so EAS cloud
 * builds get the fix too.
 */

const fs = require('fs');
const path = require('path');

const assertPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'React',
  'Base',
  'RCTAssert.m'
);

if (!fs.existsSync(assertPath)) {
  console.log('[patch-rct-fatal-handler] RCTAssert.m not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(assertPath, 'utf8');
let changed = false;

// ---- Patch 1: RCTFatal — replace @throw with no-op ----
// The original code:
//   @throw [[NSException alloc] initWithName:name reason:message userInfo:userInfo];
//
// We replace it with code that logs + persists the error, but does NOT throw.
// This breaks the crash chain: no throw → no rethrow → no terminate → no abort.

const fatalThrowBefore =
  '      @throw [[NSException alloc] initWithName:name reason:message userInfo:userInfo];';
const fatalThrowAfter = `      // [SocialPostAI crash fix] iOS 26 + Release: @throw → objc_exception_rethrow
      // → std::terminate → abort(). Replace with log + persist (no throw = no crash).
      {
        NSDictionary *__socialPostAI_errInfo = @{
          @"message": error.localizedDescription ?: @"(null)",
          @"formatted": RCTFormatError(error.localizedDescription, error.userInfo[RCTJSStackTraceKey], 500) ?: @"(no details)",
          @"time": [[NSDate date] description],
          @"via": @"rctFatalThrowPrevented"
        };
        NSData *__socialPostAI_json = [NSJSONSerialization dataWithJSONObject:__socialPostAI_errInfo options:NSJSONWritingPrettyPrinted error:nil];
        if (__socialPostAI_json) {
          NSString *__socialPostAI_docsDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
          NSString *__socialPostAI_filePath = [__socialPostAI_docsDir stringByAppendingPathComponent:@"rct_fatal_log.json"];
          [__socialPostAI_json writeToFile:__socialPostAI_filePath atomically:YES];
        }
        NSLog(@"[SocialPostAI] RCTFatal @throw prevented (not crashing): %@", message);
      }`;

if (src.includes(fatalThrowBefore)) {
  src = src.split(fatalThrowBefore).join(fatalThrowAfter);
  changed = true;
  console.log('[patch-rct-fatal-handler] RCTFatal @throw replaced with no-op');
} else if (src.includes('SocialPostAI crash fix')) {
  console.log('[patch-rct-fatal-handler] RCTFatal already patched');
} else {
  console.log('[patch-rct-fatal-handler] WARNING: RCTFatal @throw pattern not found');
  // Try flexible match
  const flexPattern =
    /@throw \[\[NSException alloc\] initWithName:name reason:message userInfo:userInfo\];/;
  if (flexPattern.test(src)) {
    src = src.replace(flexPattern, fatalThrowAfter.trim());
    changed = true;
    console.log('[patch-rct-fatal-handler] RCTFatal @throw replaced (flexible match)');
  }
}

// ---- Patch 2: RCTFatalException — replace @throw with no-op ----
// The original code:
//   @throw exception;
//
// This is in RCTFatalException, a separate entry point for NSException-level fatals.

const exceptionThrowBefore = '      @throw exception;';
const exceptionThrowAfter = `      // [SocialPostAI crash fix] Prevent @throw in RCTFatalException too.
      {
        NSDictionary *__socialPostAI_excInfo = @{
          @"message": [NSString stringWithFormat:@"%@: %@", exception.name, exception.reason],
          @"time": [[NSDate date] description],
          @"via": @"rctFatalExceptionThrowPrevented"
        };
        NSData *__socialPostAI_excJson = [NSJSONSerialization dataWithJSONObject:__socialPostAI_excInfo options:NSJSONWritingPrettyPrinted error:nil];
        if (__socialPostAI_excJson) {
          NSString *__socialPostAI_docsDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
          NSString *__socialPostAI_excFilePath = [__socialPostAI_docsDir stringByAppendingPathComponent:@"rct_fatal_log.json"];
          [__socialPostAI_excJson writeToFile:__socialPostAI_excFilePath atomically:YES];
        }
        NSLog(@"[SocialPostAI] RCTFatalException @throw prevented: %@: %@", exception.name, exception.reason);
      }`;

if (src.includes(exceptionThrowBefore)) {
  src = src.split(exceptionThrowBefore).join(exceptionThrowAfter);
  changed = true;
  console.log('[patch-rct-fatal-handler] RCTFatalException @throw replaced with no-op');
} else if (src.includes('SocialPostAI crash fix')) {
  console.log('[patch-rct-fatal-handler] RCTFatalException already patched or pattern changed');
} else {
  console.log('[patch-rct-fatal-handler] NOTE: RCTFatalException @throw pattern not found (may vary)');
}

if (changed) {
  fs.writeFileSync(assertPath, src, 'utf8');
  console.log('[patch-rct-fatal-handler] RCTAssert.m patched successfully');
} else {
  console.log('[patch-rct-fatal-handler] No changes needed (already patched or patterns not found)');
}
