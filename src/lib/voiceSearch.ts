/**
 * voiceSearch.ts — speech-to-text for the search bar, when this build can do it.
 *
 * expo-speech-recognition is native code: it is in development and store builds, not in
 * Expo Go, and its package throws the moment it is imported without that code (the same
 * reason src/lib/mapLibre.ts exists). So the package is only `require`d after the native
 * module is confirmed present; everywhere else `isVoiceSearchAvailable()` is false and the
 * mic falls back to focusing the search field.
 */

import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';

type Speech = typeof SpeechModule;

let cached: Speech | null | undefined;

function speech(): Speech | null {
  if (cached !== undefined) return cached;
  if (!requireOptionalNativeModule('ExpoSpeechRecognition')) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: Speech })
      .ExpoSpeechRecognitionModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** This build has speech recognition (dev / store build, not Expo Go). */
export function isVoiceSearchAvailable(): boolean {
  return speech() != null;
}

export type VoiceSearchResult =
  | { kind: 'text'; text: string }
  | { kind: 'nothing' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

export interface VoiceSearchSession {
  /** Stop listening and use what was heard so far. */
  stop: () => void;
  /** Stop listening and throw away what was heard. */
  cancel: () => void;
}

/**
 * Listen once. `onPartial` streams the words as they are recognised (to show them in the
 * field); `onDone` fires exactly once with the outcome. Returns null when this build has no
 * speech recognition — the caller should fall back.
 */
export async function startVoiceSearch(handlers: {
  onPartial: (text: string) => void;
  onDone: (result: VoiceSearchResult) => void;
}): Promise<VoiceSearchSession | null> {
  const mod = speech();
  if (!mod) return null;

  const permission = await mod.requestPermissionsAsync();
  if (!permission.granted) {
    handlers.onDone({ kind: 'denied' });
    return { stop: () => {}, cancel: () => {} };
  }

  let latest = '';
  let finished = false;
  const subs: { remove: () => void }[] = [];
  const finish = (result: VoiceSearchResult) => {
    if (finished) return;
    finished = true;
    subs.forEach((s) => s.remove());
    handlers.onDone(result);
  };

  subs.push(
    mod.addListener('result', (event) => {
      const text = event.results[0]?.transcript?.trim() ?? '';
      if (text) {
        latest = text;
        handlers.onPartial(text);
      }
      if (event.isFinal) finish(latest ? { kind: 'text', text: latest } : { kind: 'nothing' });
    }),
    mod.addListener('nomatch', () => finish({ kind: 'nothing' })),
    mod.addListener('error', (event) => {
      if (event.error === 'aborted') return finish({ kind: 'nothing' });
      if (event.error === 'no-speech') return finish({ kind: 'nothing' });
      if (event.error === 'not-allowed') return finish({ kind: 'denied' });
      finish({ kind: 'error', message: event.message || 'Voice search stopped unexpectedly.' });
    }),
    mod.addListener('end', () =>
      finish(latest ? { kind: 'text', text: latest } : { kind: 'nothing' }),
    ),
  );

  mod.start({ lang: 'en-IN', interimResults: true, continuous: false });

  return {
    stop: () => mod.stop(),
    cancel: () => {
      latest = '';
      mod.abort();
    },
  };
}
