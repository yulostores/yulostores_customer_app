/**
 * support.ts — the customer's Help & Support tickets.
 *
 * Endpoints (yulo_backend/server/routes/support.routes.js, mounted at
 * `/api/support` and behind `authenticate` + `authorizeRole('customer')`):
 *
 *   POST /api/support/tickets                 { category, description, orderId? } → { ticket }
 *   GET  /api/support/tickets      ?page&limit                                    → { tickets, total, page, pages }
 *   GET  /api/support/tickets/:id                                                 → { ticket }
 *   POST /api/support/tickets/:id/messages    { text }                            → { ticket }
 *
 * Customer-token-only — a local OTP-bypass session has no real token and 401s
 * here; {@link useSupportTickets} / {@link useSupportTicket} surface that as
 * `notSignedIn`, the same as {@link useOrders} and {@link useFavoriteRestaurants}.
 *
 * There is no free-text subject in this flow: the Help & Support screen offers a
 * fixed set of topics ({@link SUPPORT_TOPICS}) and the backend synthesizes
 * `SupportTicket.subject` from the chosen `category`. The wire `category` values
 * below are the contract — they mirror `CUSTOMER_CATEGORIES` in
 * yulo_backend/server/controllers/support.controller.js and the `category` enum
 * in yulo_backend/server/models/SupportTicket.js.
 */

import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPost } from './api';

type IoniconName = keyof typeof Ionicons.glyphMap;

// ─── Categories / topics ──────────────────────────────────────────────────

/** The five ticket categories the customer app can raise (backend enum). */
export type SupportCategory =
  | 'order_delayed'
  | 'wrong_missing_items'
  | 'veg_fleet_issue'
  | 'payment_refund'
  | 'other';

export interface SupportTopic {
  category: SupportCategory;
  /** The row label — also what the backend stores as `SupportTicket.subject`. */
  title: string;
  /** One-line helper under the title. */
  blurb: string;
  icon: IoniconName;
  /** Compose-screen placeholder, tuned to the topic. */
  prompt: string;
  /** Whether attaching a specific order is offered for this topic. */
  ordersRelevant: boolean;
}

/**
 * The Help & Support landing rows. `other` is rendered separately as
 * "Talk to support" rather than in the order-issues list, but it lives here so
 * {@link topicFor} can resolve every category the backend accepts.
 */
export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  {
    category: 'order_delayed',
    title: 'Order is delayed',
    blurb: 'Running late or stuck — get an ETA or a callback.',
    icon: 'time-outline',
    prompt: 'Tell us what’s happening with the delivery — how long you’ve been waiting, anything the partner told you.',
    ordersRelevant: true,
  },
  {
    category: 'wrong_missing_items',
    title: 'Wrong or missing items',
    blurb: 'Something you didn’t order, or an item missing from the bag.',
    icon: 'bag-remove-outline',
    prompt: 'List the items that were wrong or missing so we can sort out a refund or replacement.',
    ordersRelevant: true,
  },
  {
    category: 'veg_fleet_issue',
    title: 'Issue with veg-only fleet delivery',
    blurb: 'A concern about veg-only fleet handling on your delivery.',
    icon: 'leaf-outline',
    prompt: 'Describe what went wrong with the veg-only fleet handling on this order.',
    ordersRelevant: true,
  },
  {
    category: 'payment_refund',
    title: 'Payment or refund query',
    blurb: 'A charge you don’t recognise, or a refund that hasn’t arrived.',
    icon: 'card-outline',
    prompt: 'Tell us about the charge or the refund — the amount, and when you expected it.',
    ordersRelevant: true,
  },
  {
    category: 'other',
    title: 'Talk to support',
    blurb: 'Anything else — tell us what happened and we’ll take it from here.',
    icon: 'chatbubbles-outline',
    prompt: 'Describe your issue in as much detail as you can.',
    ordersRelevant: false,
  },
] as const;

/** The four order-issue topics shown in the main list (everything but `other`). */
export const ORDER_ISSUE_TOPICS: readonly SupportTopic[] = SUPPORT_TOPICS.filter(
  (t) => t.category !== 'other',
);

const TOPIC_BY_CATEGORY: Record<SupportCategory, SupportTopic> = SUPPORT_TOPICS.reduce(
  (acc, t) => {
    acc[t.category] = t;
    return acc;
  },
  {} as Record<SupportCategory, SupportTopic>,
);

/** The topic for a category, falling back to "Talk to support" for anything unknown. */
export function topicFor(category: string): SupportTopic {
  return TOPIC_BY_CATEGORY[category as SupportCategory] ?? TOPIC_BY_CATEGORY.other;
}

// ─── Status ───────────────────────────────────────────────────────────────

/** The lifecycle a ticket moves through (yulo_backend SupportTicket.js). */
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

interface StatusMeta {
  label: string;
  /** One of the app's food* accent roles — resolved to a colour by the screen. */
  tone: 'accent' | 'positive' | 'muted';
}

const STATUS_META: Record<string, StatusMeta> = {
  open: { label: 'Open', tone: 'accent' },
  in_progress: { label: 'In progress', tone: 'accent' },
  resolved: { label: 'Resolved', tone: 'positive' },
  closed: { label: 'Closed', tone: 'muted' },
};

export function ticketStatusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: status || 'Open', tone: 'muted' };
}

/** A closed ticket takes no further replies — the composer is hidden. */
export function isTicketClosed(status: string): boolean {
  return status === 'closed';
}

// ─── Wire shape (only the fields the app reads) ───────────────────────────

interface RawMessage {
  senderType?: 'admin' | 'user';
  text?: string;
  sentAt?: string | null;
}

interface RawTicket {
  _id: string;
  subject?: string;
  description?: string;
  category?: string;
  status?: string;
  orderId?: string | null;
  messages?: RawMessage[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface RawTicketListResponse {
  tickets?: RawTicket[];
  total?: number;
  page?: number;
  pages?: number;
}

// ─── View types ──────────────────────────────────────────────────────────

/** One turn in the ticket thread. `you` is the customer; `support` is the agent. */
export interface TicketMessage {
  from: 'you' | 'support';
  text: string;
  /** ISO timestamp, or null on older rows. */
  sentAt: string | null;
}

/** A support ticket, flattened for the screens. */
export interface SupportTicket {
  id: string;
  category: SupportCategory;
  /** The topic label (== backend `subject`). */
  subject: string;
  /** The customer's original description — shown as the first message. */
  description: string;
  status: TicketStatus;
  /** The order this ticket is about, if one was attached. */
  orderId: string | null;
  /** Agent replies + the customer's follow-ups, oldest first. */
  messages: TicketMessage[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** The whole thread as a flat list: the original description, then every reply. */
export function threadOf(ticket: SupportTicket): TicketMessage[] {
  return [
    { from: 'you', text: ticket.description, sentAt: ticket.createdAt },
    ...ticket.messages,
  ];
}

// ─── Reshape ─────────────────────────────────────────────────────────────

const CATEGORIES: readonly SupportCategory[] = [
  'order_delayed',
  'wrong_missing_items',
  'veg_fleet_issue',
  'payment_refund',
  'other',
];

function toCategory(raw: string | undefined): SupportCategory {
  return CATEGORIES.includes(raw as SupportCategory) ? (raw as SupportCategory) : 'other';
}

function toStatus(raw: string | undefined): TicketStatus {
  return raw === 'open' || raw === 'in_progress' || raw === 'resolved' || raw === 'closed'
    ? raw
    : 'open';
}

function toMessage(m: RawMessage): TicketMessage {
  return {
    from: m.senderType === 'admin' ? 'support' : 'you',
    text: (m.text ?? '').trim(),
    sentAt: m.sentAt ?? null,
  };
}

function toTicket(raw: RawTicket): SupportTicket {
  return {
    id: String(raw._id),
    category: toCategory(raw.category),
    subject: raw.subject?.trim() || topicFor(raw.category ?? 'other').title,
    description: (raw.description ?? '').trim(),
    status: toStatus(raw.status),
    orderId: raw.orderId ? String(raw.orderId) : null,
    messages: (raw.messages ?? []).map(toMessage).filter((m) => m.text.length > 0),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? null,
  };
}

// ─── API ─────────────────────────────────────────────────────────────────

export interface TicketsPage {
  tickets: SupportTicket[];
  total: number;
  page: number;
  pages: number;
}

/** One page (20) of the customer's tickets, newest first. */
export async function listTickets(page = 1): Promise<TicketsPage> {
  const data = await apiGet<RawTicketListResponse>('/api/support/tickets', { page });
  const tickets = (data.tickets ?? []).map(toTicket);
  return {
    tickets,
    total: data.total ?? tickets.length,
    page: data.page ?? page,
    pages: Math.max(1, data.pages ?? 1),
  };
}

/** One ticket in full — the thread screen. Throws `ApiError` 404 if not yours. */
export async function getTicket(id: string): Promise<SupportTicket> {
  const data = await apiGet<{ ticket: RawTicket }>(`/api/support/tickets/${id}`);
  return toTicket(data.ticket);
}

export interface CreateTicketInput {
  category: SupportCategory;
  description: string;
  /** Optional — the order the issue is about. Backend verifies ownership. */
  orderId?: string;
}

/** Raise a new support ticket. Resolves to the created ticket. */
export async function createTicket(input: CreateTicketInput): Promise<SupportTicket> {
  const body: Record<string, string> = {
    category: input.category,
    description: input.description.trim(),
  };
  if (input.orderId) body.orderId = input.orderId;
  const data = await apiPost<{ ticket: RawTicket }>('/api/support/tickets', body);
  return toTicket(data.ticket);
}

/** Append a customer follow-up to a ticket. Resolves to the updated ticket. */
export async function addTicketMessage(id: string, text: string): Promise<SupportTicket> {
  const data = await apiPost<{ ticket: RawTicket }>(`/api/support/tickets/${id}/messages`, {
    text: text.trim(),
  });
  return toTicket(data.ticket);
}

// ─── Display helpers ─────────────────────────────────────────────────────

/** "7 Sep 2026" — the date a ticket was raised. */
export function formatTicketDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2:45 pm" — the time a single message was sent. */
export function formatMessageTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Short display id from a Mongo ObjectId — last 6 chars, uppercased. */
export function shortTicketId(id: string): string {
  return id.slice(-6).toUpperCase();
}
