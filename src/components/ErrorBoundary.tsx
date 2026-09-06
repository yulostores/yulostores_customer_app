/**
 * ErrorBoundary — stops one bad render from white-screening the whole app.
 *
 * A component that throws during render (a malformed API shape reaching a
 * screen, a null deref) would otherwise unmount the entire tree. This catches
 * that, logs the full detail for developers, and shows the user a plain
 * "something went wrong" card with a retry that re-mounts the subtree.
 *
 * Wrap the navigator in `app/_layout.tsx`. It does NOT catch errors inside
 * event handlers or async code — those go through `reportError` at their own
 * call sites.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius, Spacing } from '../constants/Theme';
import { reportError } from '../lib/logger';

interface Props {
  children: ReactNode;
  /** Optional label so logs say which part of the tree failed. */
  scope?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(this.props.scope ?? 'react', 'Render tree crashed', error, {
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Try again — if it keeps happening,
          close and reopen the app.
        </Text>
        <Pressable
          style={styles.button}
          onPress={this.handleRetry}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.foodBg,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.foodText,
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  button: {
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
