// ============================================================
// ErrorBoundary — catches render errors before they reach
// ExceptionsManager.reportException (which triggers the native
// crash chain on iOS 26 + Release).
//
// Wrapped around AppNavigator in App.js. If a component throws
// during rendering, this boundary catches it and shows a fallback
// UI with the error details, plus a "Try Again" button to reset.
//
// The error is also persisted to AsyncStorage for diagnostics.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Persist to AsyncStorage for diagnostics
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const detail = {
        time: new Date().toISOString(),
        fatal: false,
        name: error && error.name ? String(error.name) : 'RenderError',
        message: error && error.message ? String(error.message) : String(error),
        stack:
          (errorInfo && errorInfo.componentStack) ||
          (error && error.stack ? String(error.stack).split('\n').slice(0, 20).join('\n') : '(no stack)'),
        via: 'ErrorBoundary',
      };

      AsyncStorage.getItem('@SocialPostAI:jsFatalErrors')
        .then((raw) => {
          let list = [];
          try {
            list = raw ? JSON.parse(raw) : [];
          } catch (e) {
            list = [];
          }
          if (!Array.isArray(list)) list = [];
          list.unshift(detail);
          list = list.slice(0, 10);
          return AsyncStorage.setItem('@SocialPostAI:jsFatalErrors', JSON.stringify(list));
        })
        .catch(() => {});
    } catch (e) {
      // Diagnostics are best-effort
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { error } = this.state;

      // Custom fallback (element or render function) takes precedence over the
      // default UI. Lets parents isolate error scope — e.g. wrap a single
      // child component so the rest of the screen / app stays usable when
      // just that child throws (e.g. VoiceInput on iOS 26 when expo-audio
      // native module isn't ready).
      const { fallback } = this.props;
      if (fallback) {
        if (typeof fallback === 'function') return fallback(error);
        return fallback;
      }

      const errorText = error
        ? `${error.toString()}`
        : 'Unknown error';

      const stackText =
        (this.state.errorInfo && this.state.errorInfo.componentStack) ||
        (this.state.error && this.state.error.stack) ||
        '';

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>The app caught an error but didn't crash.</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.errorText}>{errorText}</Text>
            {stackText ? (
              <Text style={styles.stackText}>{stackText}</Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 300,
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 16,
  },
  scrollContent: {
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#cc0000',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  stackText: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorBoundary;
