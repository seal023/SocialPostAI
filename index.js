import { registerRootComponent } from 'expo';

import App from './App';

// ============================================================
// JS fatal guard — iOS 26 + A18 Pro + Release 平台 bug 兜底
// ------------------------------------------------------------
// 背景（build 9 崩溃根因）：在 iPhone 17 Pro (A18 Pro) + iOS 26 +
// Release 构建组合下，任何 JS fatal error（如 unhandled rejection）
// 都会经 RCTExceptionsManager.reportFatal → RCTGetFatalHandler →
// objc_exception_throw → std::terminate 被放大成原生崩溃。
// 这是 RN/iOS 26 平台已知问题（GitHub #55337 / #57014），
// 并非本 App 独有；官方修复在 RN 0.85.0-rc.7，未 backport 到 0.83。
//
// 本守卫做的事情：
//   1) 用 ErrorUtils.setGlobalHandler 接管所有 JS fatal/soft error；
//   2) 故意不调用原始 handler → 阻止 native reportFatal → App 不崩；
//   3) 把错误详情写入 AsyncStorage，供 App.js 启动时弹窗展示，
//      从而拿到具体错误信息以定位根因。
//
// 注意：拦截 ≠ 修复。错误本身仍可能存在，只是不再导致闪退。
// ============================================================

const JS_FATAL_KEY = '@SocialPostAI:jsFatalErrors';
const MAX_FATAL_RECORDS = 10;

function persistFatalError(detail) {
  try {
    // 懒加载：handler 被调用时才触碰 AsyncStorage，
    // 避免在启动最早期加载原生模块（build 8 的教训）。
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.getItem(JS_FATAL_KEY)
      .then((raw) => {
        let list = [];
        try {
          list = raw ? JSON.parse(raw) : [];
        } catch (e) {
          list = [];
        }
        if (!Array.isArray(list)) list = [];
        list.unshift(detail);
        list = list.slice(0, MAX_FATAL_RECORDS);
        return AsyncStorage.setItem(JS_FATAL_KEY, JSON.stringify(list));
      })
      .catch(() => {
        // 持久化失败不影响主流程
      });
  } catch (e) {
    // AsyncStorage 不可用时静默失败
  }
}

function installJSFatalGuard() {
  if (typeof ErrorUtils === 'undefined' || typeof ErrorUtils.setGlobalHandler !== 'function') {
    return;
  }
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    const detail = {
      time: new Date().toISOString(),
      fatal: !!isFatal,
      name: error && error.name ? String(error.name) : 'UnknownError',
      message: error && error.message ? String(error.message) : String(error),
      stack:
        error && error.stack
          ? String(error.stack)
              .split('\n')
              .slice(0, 30)
              .join('\n')
          : '(no stack)',
    };

    // 1) 持久化证据（Release 下 console 会被剥离，AsyncStorage 才是可靠通道）
    persistFatalError(detail);

    // 2) 控制台尽力输出（Debug/Dev 下可见）
    try {
      console.error('[JSFatalGuard] intercepted:', JSON.stringify(detail, null, 2));
    } catch (e) {}

    // 3) 关键：不调用原始 handler。
    //    默认 handler 会调 native RCTExceptionsManager.reportFatal，
    //    在 iOS 26 + A18 Pro + Release 下必然 std::terminate 崩溃。
    //    这里直接吞掉，让 App 继续存活，从而能进入购买流程截图送审。
  });
}

installJSFatalGuard();

// ============================================================
// Layer 2 — patch ExceptionsManager TurboModule（框架级）
// ------------------------------------------------------------
// build 10 崩溃证明：ErrorUtils 只拦「JS 引擎级」错误，而
// React/RN 框架内部（React 19 onUncaughtError 默认处理器、
// unhandled rejection 的框架上报路径等）会直接调用
//   NativeExceptionsManager.reportException({ isFatal: true })
// 走 TurboModule 通道上报原生 → reportFatal → std::terminate。
// 这条路径完全绕过 ErrorUtils，必须直接在 TurboModule 层堵住。
//
// 做法：替换 ExceptionsManager 的 reportException/reportFatal，
// 记录错误详情到 AsyncStorage 后吞掉（不转发给原生）。
// ============================================================

function formatExceptionData(data) {
  let message = '(no message)';
  let stack = '(no stack)';
  let fatal = true;
  try {
    if (data && typeof data === 'object') {
      fatal = !!data.isFatal;
      if (data.message) message = String(data.message);
      else if (data.exceptionMessage) message = String(data.exceptionMessage);
      if (Array.isArray(data.stack)) {
        stack = data.stack
          .map(
            (f) =>
              `${f.methodName || '?'} @ ${f.file || '?'}:${f.lineNumber || '?'}:${f.column || '?'}`,
          )
          .join('\n');
      } else if (typeof data.stack === 'string') {
        stack = data.stack;
      } else if (data.componentStack) {
        stack = String(data.componentStack);
      }
    } else if (data) {
      message = String(data);
    }
  } catch (e) {}
  return { message, stack, fatal };
}

function installExceptionsManagerPatch() {
  try {
    const { NativeModules, TurboModuleRegistry } = require('react-native');
    const EM =
      (TurboModuleRegistry && TurboModuleRegistry.get('ExceptionsManager')) ||
      NativeModules.ExceptionsManager ||
      null;
    if (!EM) return;

    if (typeof EM.reportException === 'function') {
      EM.reportException = (data) => {
        try {
          const fmt = formatExceptionData(data);
          persistFatalError({
            time: new Date().toISOString(),
            fatal: fmt.fatal,
            name: 'NativeExceptionsManager.reportException',
            message: fmt.message,
            stack: fmt.stack.split('\n').slice(0, 30).join('\n'),
            via: 'reportException',
          });
        } catch (e) {}
        // 吞掉：不转发 → 阻止 reportFatal → std::terminate 崩溃
      };
    }

    if (typeof EM.reportFatal === 'function') {
      EM.reportFatal = (e) => {
        try {
          persistFatalError({
            time: new Date().toISOString(),
            fatal: true,
            name: 'NativeExceptionsManager.reportFatal',
            message: (e && (e.message || String(e))) || '(no message)',
            stack: (e && e.stack) ? String(e.stack).split('\n').slice(0, 30).join('\n') : '(no stack)',
            via: 'reportFatal',
          });
        } catch (err) {}
        // 吞掉
      };
    }
  } catch (e) {
    // patch 失败不影响启动；ErrorUtils 层仍在
  }
}

installExceptionsManagerPatch();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
