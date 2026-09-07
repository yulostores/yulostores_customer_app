/**
 * useOrderTracking.ts — Data hook for the live tracking screen.
 *
 * Combines:
 *  1. Initial REST fetch: GET /api/orders/:id/tracking
 *  2. Socket.IO real-time updates:
 *     - `order_status_updated`    → status, etaMinutes, timeline update
 *     - `partner_location_updated` → live lat/lng of the partner bike icon
 *  3. 30-second polling fallback in case the socket drops while the app is
 *     foregrounded (e.g. spotty wifi). The polling interval is cancelled the
 *     moment the socket delivers an update, so it never runs in parallel with
 *     a healthy socket connection.
 *
 * The hook is fully self-contained: mount it once on the tracking screen and
 * it handles connect/join/leave/disconnect lifecycle automatically.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getAccessToken } from '../services/session';
import { getOrderTracking, type DeliveryPartnerInfo, type PartnerLocation, type TrackingData } from '../services/tracking';
import { getSocket } from '../lib/socket';
import { logger } from '../lib/logger';

const POLL_INTERVAL_MS = 30_000;

interface UseOrderTrackingResult {
  tracking: TrackingData | null;
  /** Live partner location — updated by socket, seeded from the initial fetch. */
  partnerLocation: PartnerLocation | null;
  loading: boolean;
  error: string | null;
  /** Pull-to-refresh: re-runs the REST fetch. */
  refetch: () => Promise<void>;
}

export function useOrderTracking(orderId: string): UseOrderTrackingResult {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to the polling timer so we can cancel it when a socket update arrives.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── REST fetch ────────────────────────────────────────────────────────────
  const fetchTracking = useCallback(async () => {
    try {
      const data = await getOrderTracking(orderId);
      setTracking(data);
      setError(null);
      // Seed the live partner location from the initial response so the bike
      // icon appears immediately rather than waiting for the first socket ping.
      if (data.deliveryPartner?.currentLocation) {
        setPartnerLocation(data.deliveryPartner.currentLocation);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load tracking';
      logger.warn('useOrderTracking', 'fetchTracking failed', { orderId, message });
      setError(message);
    }
  }, [orderId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchTracking().finally(() => setLoading(false));
  }, [fetchTracking]);

  // ─── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    const token = getAccessToken();

    // Join the order room — required for the server to route events to this client.
    const joinRoom = () => {
      socket.emit('join_order', { orderId, token: token ?? '' });
      logger.debug('useOrderTracking', 'join_order emitted', { orderId });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on('connect', joinRoom);

    // ── order_status_updated ──────────────────────────────────────────────────
    const onStatusUpdate = (payload: {
      orderId: string;
      status: string;
      etaMinutes?: number | null;
    }) => {
      if (String(payload.orderId) !== orderId) return;
      logger.debug('useOrderTracking', 'order_status_updated', payload);

      setTracking((prev) => {
        if (!prev) return prev;

        // Mark the newly-reached stage as completed in the timeline.
        const updatedTimeline = prev.timeline.map((entry) => {
          const stages = ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
          const newIdx = stages.indexOf(payload.status);
          const entryIdx = stages.indexOf(entry.stage);
          const completed = payload.status === 'delivered' ? true : entryIdx <= newIdx;
          const timestamp =
            entry.stage === payload.status && !entry.timestamp
              ? new Date().toISOString()
              : entry.timestamp;
          return { ...entry, completed, timestamp };
        });

        return {
          ...prev,
          status: payload.status,
          etaMinutes: payload.etaMinutes ?? null,
          timeline: updatedTimeline,
        };
      });

      // Cancel the polling timer — the socket is healthy.
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    socket.on('order_status_updated', onStatusUpdate);

    // ── partner_location_updated ──────────────────────────────────────────────
    const onLocationUpdate = (payload: {
      orderId: string;
      lat: number;
      lng: number;
    }) => {
      if (String(payload.orderId) !== orderId) return;
      setPartnerLocation({ lat: payload.lat, lng: payload.lng });

      // Cancel the polling timer — the socket is healthy.
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    socket.on('partner_location_updated', onLocationUpdate);

    // ─── Polling fallback ──────────────────────────────────────────────────────
    // Starts 30 s after mount. If the socket fires first, the timer is cleared
    // (see the cancel calls above). If the socket is silent (dropped, app
    // backgrounded, etc.) the poll keeps the screen from going stale forever.
    pollTimerRef.current = setInterval(() => {
      fetchTracking().catch(() => {});
    }, POLL_INTERVAL_MS);

    // ─── App state — pause/resume ─────────────────────────────────────────────
    // When the app comes back to the foreground after being backgrounded,
    // the socket may have disconnected. Re-fetch immediately so the screen
    // shows the latest state without waiting for the next poll tick.
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchTracking().catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('order_status_updated', onStatusUpdate);
      socket.off('partner_location_updated', onLocationUpdate);
      appStateSub.remove();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [orderId, fetchTracking]);

  const refetch = useCallback(async () => {
    await fetchTracking();
  }, [fetchTracking]);

  return { tracking, partnerLocation, loading, error, refetch };
}
