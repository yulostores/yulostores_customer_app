/**
 * cameraOpen — whether the QR scanner's camera is taking over the screen.
 *
 * The tab bar and the scanner live in different parts of the tree (the bar is the
 * navigator's `tabBar`, the camera is the `scan` screen), and expo-router's
 * `Tabs` has no per-screen way to hide a custom bar. So the scan screen raises
 * this flag while its camera is up and `TabBar` renders nothing for as long as
 * it is raised.
 *
 * A module-level store rather than a context: there is exactly one camera, and
 * neither side needs a provider above it.
 */

import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setCameraOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCameraOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
