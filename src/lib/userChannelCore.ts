/**
 * userChannelCore.ts — the logic of the customer's personal-offer channel, with no socket,
 * React or network in it (node:test drives it; src/hooks/useUserChannel.ts wires it up).
 *
 *  - createSocketKeeper: the app has ONE socket (src/lib/socket.ts), shared with the order
 *    tracking screen. The offers channel lets it go when the app is backgrounded — but only
 *    when nothing else holds it: while a tracking screen is mounted it holds the socket, and
 *    a background never disconnects it underneath that screen.
 *
 *  - createUserChannel: on every connect, `join_user` with the current access token (refreshed
 *    first when it is about to run out). A refused join is retried with backoff — 2 s doubling
 *    to 60 s, with jitter — after refreshing the token; GUEST and DISABLED stop for good.
 *    `ackOnce` sends `offer_ack` the first time an offer is shown, never twice.
 */

export interface SocketKeeper {
  /** A screen that needs the socket connected (tracking). Returns its release. */
  hold: (who: string) => () => void;
  /** The app went to the background: disconnect unless someone holds it. */
  background: () => void;
  /** The app is back: reconnect if the background disconnected it. */
  foreground: () => void;
  isHeld: () => boolean;
}

export function createSocketKeeper(io: { disconnect: () => void; connect: () => void }): SocketKeeper {
  const holders = new Map<string, number>();
  let releasedForBackground = false;
  let inBackground = false;
  return {
    hold(who) {
      holders.set(who, (holders.get(who) ?? 0) + 1);
      if (releasedForBackground) {
        releasedForBackground = false;
        io.connect();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (holders.get(who) ?? 1) - 1;
        if (left > 0) holders.set(who, left);
        else holders.delete(who);
        // Released while backgrounded (the screen unmounted then): let it go now.
        if (inBackground && holders.size === 0 && !releasedForBackground) {
          releasedForBackground = true;
          io.disconnect();
        }
      };
    },
    background() {
      inBackground = true;
      if (holders.size > 0 || releasedForBackground) return;
      releasedForBackground = true;
      io.disconnect();
    },
    foreground() {
      inBackground = false;
      if (!releasedForBackground) return;
      releasedForBackground = false;
      io.connect();
    },
    isHeld: () => holders.size > 0,
  };
}

export type JoinAck = { ok: true } | { ok: false; code?: string };

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const REFRESH_BEFORE_EXPIRY_MS = 60_000;
const FINAL_CODES = new Set(['GUEST', 'DISABLED']);

/** The wait before retry `attempt` (0-based): 2 s doubling to 60 s, ±20 % jitter. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

/** Milliseconds until a JWT's `exp` (read, never verified); 0 when unreadable. */
export function msUntilExpiry(token: string, now: number, decode: (b64: string) => string): number {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(decode(payload)) as { exp?: number };
    return typeof exp === 'number' ? exp * 1000 - now : 0;
  } catch {
    return 0;
  }
}

export interface UserChannelDeps {
  /** Emit `join_user` and call back with the server's ack. */
  emitJoin: (token: string, ack: (reply: JoinAck) => void) => void;
  emitAck: (offerId: string) => void;
  /** The connection is up right now. */
  isConnected: () => boolean;
  /** Reconnect a socket the server closed after refusing it. */
  reconnect: () => void;
  getToken: () => string | undefined;
  /** Rotate the access token; resolves the new one (or undefined). */
  refresh: () => Promise<string | undefined>;
  now: () => number;
  decode: (b64: string) => string;
  random?: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  onState?: (state: 'joined' | 'retrying' | 'stopped') => void;
}

export interface UserChannel {
  /** Call on every socket `connect`. */
  onConnect: () => Promise<void>;
  /** Call on `disconnect` with socket.io's reason. */
  onDisconnect: (reason: string) => void;
  /** `offer_ack` for an offer shown on screen — at most once per offer. */
  ackOnce: (offerId: string) => void;
  /** Sign-out / account switch: forget acks, cancel retries, start fresh. */
  reset: () => void;
  isJoined: () => boolean;
}

export function createUserChannel(deps: UserChannelDeps): UserChannel {
  let attempt = 0;
  let timer: unknown = null;
  let stopped = false;
  let joined = false;
  const acked = new Set<string>();

  const cancel = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  const freshToken = async (): Promise<string | undefined> => {
    const token = deps.getToken();
    if (token && msUntilExpiry(token, deps.now(), deps.decode) > REFRESH_BEFORE_EXPIRY_MS) return token;
    try {
      return (await deps.refresh()) ?? deps.getToken();
    } catch {
      return deps.getToken();
    }
  };

  const scheduleRetry = () => {
    if (stopped || timer !== null) return;
    deps.onState?.('retrying');
    const wait = retryDelay(attempt, deps.random);
    attempt += 1;
    timer = deps.setTimer(() => {
      timer = null;
      if (deps.isConnected()) void join();
      else deps.reconnect();
    }, wait);
  };

  const join = async () => {
    if (stopped || !deps.isConnected()) return;
    const token = await freshToken();
    if (!token) return scheduleRetry();
    deps.emitJoin(token, (reply) => {
      if (reply.ok) {
        attempt = 0;
        joined = true;
        deps.onState?.('joined');
        return;
      }
      joined = false;
      if (reply.code && FINAL_CODES.has(reply.code)) {
        stopped = true;
        cancel();
        deps.onState?.('stopped');
        return;
      }
      deps.refresh().catch(() => undefined);
      scheduleRetry();
    });
  };

  return {
    onConnect: async () => {
      cancel();
      await join();
    },
    onDisconnect: (reason) => {
      joined = false;
      // The server closed it after refusing the join: socket.io won't reconnect by itself.
      if (reason === 'io server disconnect') scheduleRetry();
    },
    ackOnce: (offerId) => {
      if (acked.has(offerId) || !joined) return;
      acked.add(offerId);
      deps.emitAck(offerId);
    },
    reset: () => {
      cancel();
      acked.clear();
      attempt = 0;
      stopped = false;
      joined = false;
    },
    isJoined: () => joined,
  };
}
