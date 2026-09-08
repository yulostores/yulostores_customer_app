/**
 * crashReporter.ts — the one seam between the app's error logging and a crash /
 * error-reporting SDK.
 *
 * Today every function here is a no-op: handled errors and uncaught exceptions still
 * flow through {@link "./logger".reportError} to the console (and RN's red box), and
 * nothing leaves the device. The Sentry wiring is written out below and commented —
 * switching it on is a contained change that touches no call site, the same
 * arrangement as the Razorpay seam in src/services/payments.ts:
 *
 *   1. `npx expo install @sentry/react-native`
 *   2. app.json → add the config plugin and a DSN:
 *        "plugins": [ …, ["@sentry/react-native/expo", { "organization": "…", "project": "…" }] ]
 *        "extra":   { …, "sentryDsn": "https://…ingest.sentry.io/…" }
 *      (or feed SENTRY_DSN through EAS and read it into extra at build time).
 *   3. Rebuild the dev client / run a fresh native build — the SDK ships native code.
 *   4. Here: uncomment the `import * as Sentry …` line and the two commented blocks,
 *      then delete the `SENTRY_ENABLED = false` line.
 *
 * logger.ts calls {@link initCrashReporter} once at startup and {@link captureError}
 * from every `reportError`, so once the blocks below are live the whole app is covered
 * with no other edit.
 */

import Constants from 'expo-constants';

// import * as Sentry from '@sentry/react-native';

/** Delete this line when enabling (step 4); the commented `import` above replaces it. */
const SENTRY_ENABLED = false;

const dsn: string | undefined =
  (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn || undefined;

type Context = Record<string, unknown>;

let started = false;

/** Call once, as early as possible — app/_layout.tsx, beside installGlobalErrorLogging(). */
export function initCrashReporter(): void {
  if (started || !SENTRY_ENABLED || !dsn) return;
  started = true;

  // Sentry.init({
  //   dsn,
  //   environment: __DEV__ ? 'development' : 'production',
  //   enableNativeCrashHandling: true,
  //   // logger.ts installs the global JS handler and forwards here; leave Sentry its
  //   // native-crash and unhandled-rejection coverage, skip perf tracing for now.
  //   tracesSampleRate: 0,
  // });
}

/**
 * Forward one caught/handled error. Safe to call before {@link initCrashReporter}
 * (and while disabled) — it just returns.
 */
export function captureError(
  scope: string,
  message: string,
  err: unknown,
  context?: Context,
): void {
  if (!started) {
    void scope;
    void message;
    void err;
    void context;
    return;
  }

  // const cause = err instanceof Error ? err : new Error(message, { cause: err });
  // Sentry.captureException(cause, { tags: { scope }, extra: { message, ...context } });
}
