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

let _socket: Socket | null = null;

/** Returns the shared socket, creating it if necessary. */
export function getSocket(): Socket {
  if (_socket && _socket.connected) return _socket;

  // Destroy any stale/disconnected instance before creating a new one.
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  const token = getAccessToken();
  _socket = io(API_BASE_URL, {
    auth: { token: token ?? '' },
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
 * Tears down the current socket and creates a fresh one with the latest token.
 * Call this after a token refresh if real-time events stop arriving.
 */
export function reconnectSocket(): Socket {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
  return getSocket();
}

/** Disconnects and clears the singleton (e.g. on sign-out). */
export function destroySocket(): void {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
    logger.debug('socket', 'destroyed');
  }
}
