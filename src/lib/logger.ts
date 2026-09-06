/**
 * logger.ts — the one place every error and diagnostic passes through.
 *
 * Two audiences, one call site:
 *  - Developers: full structured detail to the JS console (Metro / Flipper /
 *    `adb logcat` / Xcode). Verbose (`debug`/`info`) only while developing;
 *    `warn` and `error` always, including release builds.
 *  - End users: never see anything from here. Screens keep showing their own
 *    friendly copy — this module only decides what the console and (later) a
 *    crash reporter receive.
 *
 * {@link reportError} is the single seam for wiring Sentry / Crashlytics later:
 * add the SDK call there and every service picks it up for free. Mirrors the
 * backend's `server/utils/logger.js` ergonomics — `logger.error(scope, msg, ctx)`.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

const WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Metro defines `__DEV__`; guard anyway so this file is safe to import anywhere. */
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

/** Show everything in dev; ship only warn+ in release builds. */
const MIN_WEIGHT = IS_DEV ? WEIGHT.debug : WEIGHT.warn;

/** Flatten an unknown thrown value into something a console / reporter can read. */
export function describeError(err: unknown): Context {
  if (err instanceof Error) {
    const out: Context = { name: err.name, message: err.message };
    const anyErr = err as Error & { code?: unknown; status?: unknown; cause?: unknown };
    if (anyErr.code !== undefined) out.code = anyErr.code;
    if (typeof anyErr.status === 'number') out.status = anyErr.status;
    if (anyErr.cause !== undefined) out.cause = String(anyErr.cause);
    if (IS_DEV && err.stack) out.stack = err.stack;
    return out;
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

function emit(level: Level, scope: string, message: string, context?: Context): void {
  if (WEIGHT[level] < MIN_WEIGHT) return;

  const tag = `[${scope}]`;
  const payload = context && Object.keys(context).length > 0 ? context : undefined;
  // Route through the matching console method so LogBox (dev) and the native
  // log streams (release) keep their severity + grouping.
  const sink =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.log;

  if (payload) sink(tag, message, payload);
  else sink(tag, message);
}

export const logger = {
  /** Fine-grained trace — dropped from release builds. */
  debug: (scope: string, message: string, context?: Context) => emit('debug', scope, message, context),
  /** Notable lifecycle event — dropped from release builds. */
  info: (scope: string, message: string, context?: Context) => emit('info', scope, message, context),
  /** Handled problem the user recovered from (offline fallback, empty result). */
  warn: (scope: string, message: string, context?: Context) => emit('warn', scope, message, context),
  /** Something went wrong that a developer should look at. */
  error: (scope: string, message: string, context?: Context) => emit('error', scope, message, context),
};

/**
 * Report a caught error. Emits one structured `error` line for developers now,
 * and is the single place to also forward to a crash reporter later.
 *
 * @param scope    short subsystem tag, e.g. `'api'`, `'auth'`, `'geo'`
 * @param message  what was being attempted, in plain words
 * @param err      the caught value (any type)
 * @param context  extra structured fields (ids, urls, params — no secrets/PII)
 */
export function reportError(scope: string, message: string, err: unknown, context?: Context): void {
  emit('error', scope, message, { ...context, error: describeError(err) });

  // TODO(observability): once a crash-reporting SDK is added, forward here so
  // every service benefits without touching its call sites, e.g.
  //   Sentry.captureException(err, { tags: { scope }, extra: context });
}

/**
 * Install a last-resort handler so an uncaught JS exception is logged (and,
 * later, reported) instead of only flashing RN's red box. Unhandled promise
 * rejections keep RN's own dev-time tracking. Call once, as early as possible.
 */
export function installGlobalErrorLogging(): void {
  const g = globalThis as typeof globalThis & {
    __yuloGlobalErrorLogging?: boolean;
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
  if (g.__yuloGlobalErrorLogging) return;
  g.__yuloGlobalErrorLogging = true;

  const errorUtils = g.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(
        'global',
        isFatal ? 'Fatal uncaught exception — app will crash' : 'Uncaught exception',
        error,
        { isFatal: Boolean(isFatal) },
      );
      // Keep RN's own overlay / crash behaviour intact.
      previous?.(error, isFatal);
    });
  }
}
