/**
 * useUserChannel.ts — the customer's personal-offers channel on the shared socket.
 *
 * While `enabled` (feature on, a real signed-in customer, sharing on) and the app is in the
 * foreground: `join_user` on every connect with a fresh token, retried with backoff when
 * refused, stopped on GUEST / DISABLED (the logic is in userChannelCore.ts, tested there);
 * `offer_received` / `offer_updated` go to the handlers; `ackOnce` sends `offer_ack` when an
 * offer is first shown. In the background the socket is let go — unless the order-tracking
 * screen holds it (src/lib/socket.ts → holdSocket).
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getSocket, releaseSocketForBackground, resumeSocketAfterBackground } from '../lib/socket';
import { createUserChannel, type JoinAck, type UserChannel } from '../lib/userChannelCore';
import { logger } from '../lib/logger';
import { refreshAccessTokenNow } from '../services/api';
import { getAccessToken } from '../services/session';
import type { RawOfferReceived, RawOfferUpdated } from '../services/offers';

export interface UserChannelHandlers {
  onOfferReceived: (offer: RawOfferReceived) => void;
  onOfferUpdated: (update: RawOfferUpdated) => void;
  /** Joined (again): a good moment to refetch what may have been missed. */
  onJoined: () => void;
}

/** Returns `ackOnce(offerId)` (a no-op until joined). */
export function useUserChannel(enabled: boolean, accountKey: string | null, handlers: UserChannelHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const channelRef = useRef<UserChannel | null>(null);

  useEffect(() => {
    if (!enabled || !accountKey) return undefined;
    const socket = getSocket();
    const channel = createUserChannel({
      emitJoin: (token, ack) => socket.emit('join_user', { token }, (reply: JoinAck) => ack(reply ?? { ok: false })),
      emitAck: (offerId) => socket.emit('offer_ack', { offerId }),
      isConnected: () => socket.connected,
      reconnect: () => socket.connect(),
      getToken: getAccessToken,
      refresh: refreshAccessTokenNow,
      now: Date.now,
      decode: (b64) => globalThis.atob(b64),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      onState: (state) => {
        logger.debug('offers', `channel ${state}`);
        if (state === 'joined') handlersRef.current.onJoined();
      },
    });
    channelRef.current = channel;

    const onConnect = () => void channel.onConnect();
    const onDisconnect = (reason: string) => channel.onDisconnect(reason);
    const onReceived = (payload: RawOfferReceived) => handlersRef.current.onOfferReceived(payload);
    const onUpdated = (payload: RawOfferUpdated) => handlersRef.current.onOfferUpdated(payload);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('offer_received', onReceived);
    socket.on('offer_updated', onUpdated);
    if (socket.connected) onConnect();

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') resumeSocketAfterBackground();
      else if (next === 'background') releaseSocketForBackground();
    });

    return () => {
      appState.remove();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('offer_received', onReceived);
      socket.off('offer_updated', onUpdated);
      channel.reset();
      channelRef.current = null;
    };
  }, [enabled, accountKey]);

  return (offerId: string) => channelRef.current?.ackOnce(offerId);
}
