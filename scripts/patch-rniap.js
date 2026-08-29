/**
 * Patch RNIap.podspec to remove explicit New Architecture dependencies
 * that CocoaPods cannot resolve from spec repos.
 * These are provided by use_react_native! in the Podfile.
 *
 * Fixes: "Unable to find a specification for 'RCT-Folly' depended upon by 'RNIap'"
 */
const fs = require('fs');
const path = require('path');

const podspecPath = path.join(__dirname, '..', 'node_modules', 'react-native-iap', 'RNIap.podspec');

if (!fs.existsSync(podspecPath)) {
  console.log('[patch-rniap] RNIap.podspec not found, skipping');
  process.exit(0);
}

let content = fs.readFileSync(podspecPath, 'utf-8');

if (content.includes('# Patched by postinstall')) {
  console.log('[patch-rniap] Already patched, skipping');
  process.exit(0);
}

const linesToComment = [
  's.dependency "React-Codegen"',
  's.dependency "RCT-Folly"',
  's.dependency "RCTRequired"',
  's.dependency "RCTTypeSafety"',
  's.dependency "ReactCommon/turbomodule/core"',
];

for (const line of linesToComment) {
  content = content.replace(line, `# ${line}  # Patched by postinstall`);
}

fs.writeFileSync(podspecPath, content);
console.log('[patch-rniap] RNIap.podspec patched successfully');
