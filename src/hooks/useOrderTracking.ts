/**
 * useOrderTracking.ts — Data hook for the live tracking screen.
 *
 * Combines:
 *  1. Initial REST fetch: GET /api/orders/:id/tracking
 *  2. Socket.IO real-time updates:
 *     - `order_status_updated`    → status, etaMinutes, timeline update
 *     - `delivery_assignment_updated` → assignmentStatus + partner details (accepted/picked up/delivered)
 *     - `partner_location_updated` → live lat/lng of the partner bike icon
 *  3. A 30-second REST refresh that runs for the whole time the screen is open. It still covers
 *     a dropped socket, but it is no longer only a fallback: the route polyline and the
 *     traffic-aware ETA are computed server-side and ride on the REST payload alone, so they
 *     would otherwise never update while the socket happily streamed rider positions.
 *
 * The hook is fully self-contained: mount it once on the tracking screen and
 * it handles connect/join/leave/disconnect lifecycle automatically.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { ApiError } from '../services/api';
import { getAccessToken } from '../services/session';
import {
  cancelOrder,
  getOrderTracking,
  getVegFleetStatus,
  keepWaitingVegFleet,
  vegFleetFallback,
  type DeliveryPartnerInfo,
  type OrderAssignmentStatus,
  type PartnerLocation,
  type TrackingData,
  type VegFleetState,
} from '../services/tracking';
import { getSocket } from '../lib/socket';
import { logger, reportError } from '../lib/logger';

const POLL_INTERVAL_MS = 30_000;

interface UseOrderTrackingResult {
  tracking: TrackingData | null;
  /** Live partner location — updated by socket, seeded from the initial fetch. */
  partnerLocation: PartnerLocation | null;
  loading: boolean;
  error: string | null;
  /** Pull-to-refresh: re-runs the REST fetch. */
  refetch: () => Promise<void>;
  /** Veg-only-fleet search state — `null` until the first fetch resolves.
   *  `status: 'not_requested'` covers every order that didn't opt in. */
  vegFleet: VegFleetState | null;
  /** Resets the veg-fleet search window (`searching` state only). */
  keepWaiting: () => Promise<void>;
  /** Accepts any available partner instead of waiting (`searching` state only). */
  useAnyPartner: () => Promise<void>;
  /** Withdraws the order while the restaurant hasn't accepted it. Throws `ApiError`
   *  `ORDER_NOT_CANCELLABLE` once it has; the screen is refreshed either way. */
  cancel: () => Promise<void>;
}

export function useOrderTracking(orderId: string): UseOrderTrackingResult {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vegFleet, setVegFleet] = useState<VegFleetState | null>(null);

  // Ref to the refresh timer, so the effect can tear it down on unmount.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Last assignment status we know of. Lets a socket ping notice that the delivery has moved to
  // its next leg and pull a fresh route immediately, instead of drawing the previous leg's line
  // until the next scheduled refresh.
  const assignmentRef = useRef<OrderAssignmentStatus | null>(null);

  // Fetches overlap — the 30 s poll, socket events, app-resume and pull-to-refresh can all
  // be in flight at once — and can resolve out of order. Only the most recently started one
  // may write state, so a slow response from before the restaurant accepted can't flip the
  // screen back to "waiting" after a newer one said "accepted".
  const latestFetchRef = useRef(0);

  // ─── REST fetch ────────────────────────────────────────────────────────────
  const fetchTracking = useCallback(async () => {
    const seq = ++latestFetchRef.current;
    const isStale = () => seq !== latestFetchRef.current;
    try {
      const data = await getOrderTracking(orderId);
      if (isStale()) return;
      setTracking(data);
      assignmentRef.current = data.assignmentStatus;
      setError(null);
      // Seed the live partner location from the initial response so the bike
      // icon appears immediately rather than waiting for the first socket ping.
      if (data.deliveryPartner?.currentLocation) {
        setPartnerLocation(data.deliveryPartner.currentLocation);
      }
    } catch (err: unknown) {
      if (isStale()) return;
      const message = err instanceof Error ? err.message : 'Failed to load tracking';
      logger.warn('useOrderTracking', 'fetchTracking failed', { orderId, message });
      setError(message);
    }

    // A cheap single GET, safe to run for every order — `not_requested` covers
    // the common case of an order that never opted into the veg-only fleet.
    // Kept out of the try/catch above so a hiccup here never blocks the main
    // tracking display.
    try {
      const fleet = await getVegFleetStatus(orderId);
      if (!isStale()) setVegFleet(fleet);
    } catch (err) {
      logger.warn('useOrderTracking', 'veg-fleet status fetch failed', {
        orderId,
        reason: err instanceof Error ? err.message : String(err),
      });
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
      cancellationReason?: string | null;
    }) => {
      if (String(payload.orderId) !== orderId) return;
      logger.debug('useOrderTracking', 'order_status_updated', payload);

      // Who cancelled, the refund state, acceptedAt and the fresh ETA/route only come on the
      // REST payload, so pull it straight away rather than on the next 30 s tick. Starting a
      // fetch also makes any older one still in flight stale (see latestFetchRef), so it
      // can't overwrite this newer status. The patch below flips the screen instantly
      // in the meantime.
      fetchTracking().catch(() => {});

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

        const cancelled = payload.status === 'cancelled';
        return {
          ...prev,
          status: payload.status,
          etaMinutes: payload.etaMinutes ?? null,
          // A cancelled order has no position on the happy path — keep the stages it
          // actually reached (as the server does) instead of un-ticking all of them.
          timeline: cancelled ? prev.timeline : updatedTimeline,
          awaitingRestaurantApproval: payload.status === 'placed',
          approvalExpiresAt: payload.status === 'placed' ? prev.approvalExpiresAt : null,
          cancellation: cancelled
            ? prev.cancellation ?? { reason: payload.cancellationReason ?? null, by: null, at: null }
            : null,
        };
      });
    };
    socket.on('order_status_updated', onStatusUpdate);

    // ── delivery_assignment_updated ────────────────────────────────────────────
    // Fired by the delivery-partner app's accept/verify-pickup/deliver actions —
    // these change Order.deliveryAssignment.status without necessarily changing
    // Order.status, so they need their own event rather than riding along on
    // order_status_updated. Patches assignmentStatus and merges the partner
    // snapshot in place so "Partner assigned" / "Picked up" show live.
    const onAssignmentUpdate = (payload: {
      orderId: string;
      assignmentStatus: OrderAssignmentStatus;
      partner: Pick<DeliveryPartnerInfo, 'id' | 'name' | 'vehicleType' | 'vehicleNumber'> & {
        maskedPhone: string | null;
      } | null;
    }) => {
      if (String(payload.orderId) !== orderId) return;
      logger.debug('useOrderTracking', 'delivery_assignment_updated', payload);
      assignmentRef.current = payload.assignmentStatus;

      setTracking((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assignmentStatus: payload.assignmentStatus,
          // Merge onto whatever partner snapshot the last REST fetch had — this event's
          // payload only ever carries the fields that can change over the partner's
          // lifecycle (name/phone/vehicle), not rating/avatar/delivery-count, which the
          // next poll or foreground refetch fills in as usual.
          deliveryPartner: payload.partner
            ? {
                avatarUrl: prev.deliveryPartner?.avatarUrl ?? null,
                rating: prev.deliveryPartner?.rating ?? 0,
                totalDeliveries: prev.deliveryPartner?.totalDeliveries ?? 0,
                usesVegOnlyFleetBag: prev.deliveryPartner?.usesVegOnlyFleetBag ?? false,
                currentLocation: prev.deliveryPartner?.currentLocation,
                ...payload.partner,
              }
            : prev.deliveryPartner,
        };
      });
    };
    socket.on('delivery_assignment_updated', onAssignmentUpdate);

    // ── partner_location_updated ──────────────────────────────────────────────
    // Fires for both delivery legs now (rider → restaurant as well as rider → customer), so the
    // customer can watch the rider approach the restaurant rather than only seeing them appear
    // after pickup. `heading` is null on a stationary fix; the map falls back to the direction
    // between consecutive pings in that case.
    const onLocationUpdate = (payload: {
      orderId: string;
      lat: number;
      lng: number;
      heading?: number | null;
      speed?: number | null;
      assignmentStatus?: OrderAssignmentStatus | null;
    }) => {
      if (String(payload.orderId) !== orderId) return;
      setPartnerLocation({
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading ?? null,
        speed: payload.speed ?? null,
      });

      // The route and the ETA travel only on the REST payload, so a stream of socket pings would
      // otherwise leave the drawn route trailing further and further behind the rider. Refetching
      // on a leg change is the cheap fix for the case that matters most — pickup, where the route
      // flips from rider→restaurant to rider→customer and the old line becomes actively wrong.
      if (payload.assignmentStatus && payload.assignmentStatus !== assignmentRef.current) {
        assignmentRef.current = payload.assignmentStatus;
        fetchTracking().catch(() => {});
      }
    };
    socket.on('partner_location_updated', onLocationUpdate);

    // ── veg_fleet_status_updated ──────────────────────────────────────────────
    // Same room as the listeners above — the server emits this whenever the
    // veg-only-fleet search status changes (found a partner, window renewed,
    // customer fell back to any partner, background sweep expired the window).
    const onVegFleetUpdate = (payload: {
      orderId: string;
      status?: string;
      remainingSeconds?: number | null;
    }) => {
      if (String(payload.orderId) !== orderId) return;
      logger.debug('useOrderTracking', 'veg_fleet_status_updated', payload);
      const status =
        payload.status === 'searching' ||
        payload.status === 'assigned' ||
        payload.status === 'fallback_any_partner'
          ? payload.status
          : 'not_requested';
      setVegFleet({
        status,
        remainingSeconds: typeof payload.remainingSeconds === 'number' ? payload.remainingSeconds : null,
      });
    };
    socket.on('veg_fleet_status_updated', onVegFleetUpdate);

    // ─── Periodic refresh ──────────────────────────────────────────────────────
    // This used to be a pure fallback that cancelled itself as soon as the socket proved healthy.
    // It cannot be any more, because the socket no longer carries everything the screen shows:
    // the route polyline and the traffic-aware ETA are computed server-side and arrive only on
    // the REST payload. A cancelled timer would leave a healthy socket moving the rider marker
    // along a route line and beside an ETA that were both frozen at mount.
    //
    // The cost of keeping it running is bounded on the server, where routes are cached per
    // order-leg (see yulo_backend's routing.service.js), so a refresh during an active delivery
    // usually costs a cache read rather than a HERE transaction.
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
      socket.off('delivery_assignment_updated', onAssignmentUpdate);
      socket.off('partner_location_updated', onLocationUpdate);
      socket.off('veg_fleet_status_updated', onVegFleetUpdate);
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

  const keepWaiting = useCallback(async () => {
    try {
      setVegFleet(await keepWaitingVegFleet(orderId));
    } catch (err) {
      reportError('useOrderTracking', 'keep-waiting failed', err, { orderId });
      throw err;
    }
  }, [orderId]);

  const useAnyPartner = useCallback(async () => {
    try {
      setVegFleet(await vegFleetFallback(orderId));
    } catch (err) {
      reportError('useOrderTracking', 'veg-fleet fallback failed', err, { orderId });
      throw err;
    }
  }, [orderId]);

  const cancel = useCallback(async () => {
    try {
      await cancelOrder(orderId);
    } catch (err) {
      // Too late to cancel is an expected outcome (the restaurant answered first), not a fault.
      if (!(err instanceof ApiError && err.code === 'ORDER_NOT_CANCELLABLE')) {
        reportError('useOrderTracking', 'customer cancel failed', err, { orderId });
      }
      throw err;
    } finally {
      // Success or not (most often the restaurant just accepted it), show the real state.
      await fetchTracking();
    }
  }, [orderId, fetchTracking]);

  return {
    tracking,
    partnerLocation,
    loading,
    error,
    refetch,
    vegFleet,
    keepWaiting,
    useAnyPartner,
    cancel,
  };
}
