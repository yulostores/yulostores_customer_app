/**
 * useAppConfig.ts — the data behind the Settings screens.
 *
 * One read of `GET /api/app/config` (src/services/appConfig.ts) for the language
 * list, the payment-method catalogue, the "About Yulo Stores" block and the
 * legal-document index. The endpoint is public — no session, nothing
 * user-specific — so there's no auth gating here; the customer's *chosen*
 * language is a separate concern (src/hooks/usePreferredLanguage.ts).
 *
 * The payload is small and effectively static for a session, so the first fetch
 * is cached at module scope and every screen that calls this hook shares it —
 * opening Settings → About → Language → back does one network call, not four.
 * `refresh()` forces a re-fetch (pull-to-retry after a failure).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { fetchAppConfig, type AppConfig } from '../services/appConfig';

let cached: AppConfig | null = null;
let inflight: Promise<AppConfig> | null = null;

function loadConfig(force: boolean): Promise<AppConfig> {
  if (!force && cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchAppConfig()
      .then((cfg) => {
        cached = cfg;
        return cfg;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

interface UseAppConfigResult {
  config: AppConfig | null;
  /** First load, nothing cached yet. */
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function messageFor(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not load settings.';
}

export function useAppConfig(): UseAppConfigResult {
  const [config, setConfig] = useState<AppConfig | null>(cached);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (force: boolean) => {
    if (!force && cached) {
      setConfig(cached);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const cfg = await loadConfig(force);
      if (mountedRef.current) setConfig(cfg);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('appConfig', `App config unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('appConfig', 'Failed to load app config', err);
      }
      if (mountedRef.current) setError(messageFor(err));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    run(false);
  }, [run]);

  return { config, isLoading, error, refresh: () => run(true) };
}
