/**
 * app/legal/[doc].tsx — the Terms / Privacy screen, reachable before signing in.
 *
 * The sign-in screen asks the customer to agree to these documents, but the only route to
 * them (settings/legal/[doc]) sits behind the sign-in guard. This is the same screen under a
 * public path, registered outside the guards in app/_layout.tsx. `GET /api/app/legal/:doc`
 * needs no session.
 */

export { default } from '../settings/legal/[doc]';
