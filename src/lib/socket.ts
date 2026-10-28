/**
 * socket.ts — Singleton Socket.IO client for the customer app.
 *
 * Design decisions:
 *  - Lazy: the socket is created only when the first screen needs it, not at
 *    app boot. This avoids a spurious connection for users who never open a
 *    tracking screen.
 *  - Singleton: a single socket is reused across screens. Calling `getSocket()`
 *    on a connected socket returns the existing instance.
 *  - Token: the access token is injected into the socket's auth object at
 *    connection time. If the token rotates (refresh), call `reconnectSocket()`
 *    to force a fresh handshake.
 *  - Auto-reconnect: socket.io-client's built-in reconnection handles transient
 *    network drops. The `join_order` emit must be re-sent after each reconnect
 *    because the server-side room membership is not persistent across socket
 *    reconnections; callers handle this in their own `connect` event listeners.
 */

import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../constants/Api';
import { getAccessToken } from '../services/session';
import { logger } from './logger';
import { createSocketKeeper, type SocketKeeper } from './userChannelCore';

let _socket: Socket | null = null;
let _keeper: SocketKeeper | null = null;

/**
 * Returns the shared socket, creating it if necessary. An existing instance is always reused —
 * connected, connecting or mid auto-reconnect. Replacing one that was merely "not connected yet"
 * stripped the listeners every open screen had attached to it, and their events silently stopped.
 */
export function getSocket(): Socket {
  if (_socket) return _socket;

  _socket = io(API_BASE_URL, {
    // A function, so every handshake (including socket.io's own reconnects) reads the current token.
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    transports: ['websocket'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
    timeout: 10_000,
  });

  _socket.on('connect', () => {
    logger.debug('socket', 'connected', { id: _socket?.id });
  });

  _socket.on('connect_error', (err) => {
    logger.warn('socket', 'connect_error', { message: err.message });
  });

  _socket.on('disconnect', (reason) => {
    logger.debug('socket', 'disconnected', { reason });
  });

  return _socket;
}

/**
 * Re-handshakes the shared socket with the latest token — after a token refresh. Keeps the same
 * instance and its listeners: screens re-join their rooms from their own 'connect' handlers.
 */
export function reconnectSocket(): Socket {
  const socket = getSocket();
  socket.disconnect();
  socket.connect();
  return socket;
}

/**
 * Like {@link reconnectSocket}, but a no-op when no socket has been created yet —
 * so a token refresh re-handshakes an in-use connection without spawning one for
 * a user who never opened a real-time screen.
 */
export function reconnectSocketIfActive(): void {
  if (_socket) reconnectSocket();
}

// The personal-offers channel lets the socket go while the app is in the background — but only
// when no screen holds it (the tracking screen does, for as long as it is mounted). See
// createSocketKeeper in userChannelCore.ts.
function keeper(): SocketKeeper {
  if (!_keeper) {
    _keeper = createSocketKeeper({
      disconnect: () => _socket?.disconnect(),
      connect: () => _socket?.connect(),
    });
  }
  return _keeper;
}

/** A screen that needs the socket connected even in the background. Returns its release. */
export function holdSocket(who: string): () => void {
  getSocket();
  return keeper().hold(who);
}

/** App went to the background: disconnect, unless a screen holds the socket. */
export function releaseSocketForBackground(): void {
  if (_socket) keeper().background();
}

/** App came back: reconnect if the background disconnected it. */
export function resumeSocketAfterBackground(): void {
  keeper().foreground();
}

/** Disconnects and clears the singleton (e.g. on sign-out). */
export function destroySocket(): void {
  _keeper = null;
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
    logger.debug('socket', 'destroyed');
  }
}
