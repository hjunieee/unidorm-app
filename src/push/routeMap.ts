/**
 * `type` -> in-portal path builder (spec G3 step 1). The web team hasn't
 * confirmed dedicated in-app routes for any notification `type` yet (e.g. a
 * `FRIEND` detail page, an in-app notice viewer for `SCHOOL_NOTICE`), so this
 * table is intentionally empty: every payload falls through to `data.path`
 * (see `resolveNavIntent` in `navIntent.ts`, step 2). Once a route is
 * confirmed, add an entry here — the rest of the pipeline needs no changes.
 *
 * Kept dependency-free (same reasoning as `navPath.ts`) so it stays
 * unit-testable without Firebase/notifee.
 */

/** Server-defined notification `type` (`data.type`, always a string over FCM). */
export type NotificationType =
  | 'GENERAL'
  | 'CHAT'
  | 'CHAT_OPEN'
  | 'CHAT_PERSONAL'
  | 'CHAT_ROOMMATE'
  | 'ANNOUNCEMENT'
  | 'NOTICE'
  | 'COMPLAINT'
  | 'ROOMMATE_POST'
  | 'SCHOOL_NOTICE'
  | 'DEPARTMENT'
  | 'FRIEND';

/**
 * Given the full `data` payload (so a builder can read e.g. `targetId` /
 * `noticeId` / `chatRoomId`), return the in-portal path for that `type`, or
 * `undefined` to fall through to `data.path`.
 */
type RouteBuilder = (data: Record<string, unknown>) => string | undefined;

function extractId(data: Record<string, unknown>): string | undefined {
  const candidate =
    data.targetId ??
    data.chatRoomId ??
    data.noticeId ??
    data.complaintId ??
    data.roommatePostId ??
    data.id;
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  if (typeof candidate === 'number') return String(candidate);
  return undefined;
}

const ROUTE_MAP: Partial<Record<NotificationType, RouteBuilder>> = {
  CHAT: (data) => {
    const id = extractId(data);
    return id ? `/chat/open/${id}` : undefined;
  },
  CHAT_OPEN: (data) => {
    const id = extractId(data);
    return id ? `/chat/open/${id}` : undefined;
  },
  CHAT_PERSONAL: (data) => {
    const id = extractId(data);
    return id ? `/chat/open/${id}` : undefined;
  },
  CHAT_ROOMMATE: (data) => {
    const id = extractId(data);
    return id ? `/chat/roommate/${id}` : undefined;
  },
  ANNOUNCEMENT: (data) => {
    const id = extractId(data);
    return id ? `/announcements/${id}` : undefined;
  },
  NOTICE: (data) => {
    const id = extractId(data);
    return id ? `/announcements/${id}` : undefined;
  },
  COMPLAINT: (data) => {
    const id = extractId(data);
    return id ? `/complain/${id}` : undefined;
  },
  ROOMMATE_POST: (data) => {
    const id = extractId(data);
    return id ? `/roommate/list/${id}` : undefined;
  },
};

/** Map a notification's `type` to a portal path via `ROUTE_MAP`, if present. */
export function routeForType(data?: Record<string, unknown>): string | null {
  if (!data) return null;
  const { type } = data;
  if (typeof type !== 'string') return null;
  const builder = ROUTE_MAP[type as NotificationType];
  if (!builder) return null;
  return builder(data) ?? null;
}
