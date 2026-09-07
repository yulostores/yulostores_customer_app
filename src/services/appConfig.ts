/**
 * appConfig.ts — everything the Settings screen renders, from the backend.
 *
 * Endpoints (see yulo_backend/API.md → "Public — App Config"):
 *   GET /api/app/config          → languages, payment catalogue, About block,
 *                                  legal-document index (titles + dates)
 *   GET /api/app/legal/:docId    → one legal document with its full sections
 *
 * Both are public — no session needed, nothing user-specific. The customer's
 * *chosen* language is a preference (src/services/preferences.ts), not part of
 * this payload. Nothing on the Settings screens is hard-coded: the rows, the
 * language list, the payment methods, the company details and the legal text
 * all come from here, so what the app shows and what's on file stay in step.
 */

import { apiGet } from './api';

// ─── View types ─────────────────────────────────────────────────────────────

export interface AppLanguage {
  /** BCP-47-ish code stored in `preferences.preferredLanguage`, e.g. "en". */
  code: string;
  /** English name, e.g. "Hindi". */
  label: string;
  /** The language's own name, e.g. "हिन्दी". */
  endonym: string;
  /** The app ships strings for it — only these are selectable. */
  available: boolean;
}

export interface PaymentCatalogueGroup {
  id: string;
  title: string;
  subtitle: string | null;
  defaultOpen: boolean;
}

export interface PaymentCatalogueMethod {
  id: string;
  group: string;
  label: string;
  hint: string | null;
  /** Ionicons glyph name (the screen casts to the icon set). */
  icon: string;
  /** Badge tint. */
  tint: string;
  /** The only value the order API accepts. */
  wire: 'cod' | 'online';
}

export interface SocialLink {
  id: string;
  label: string;
  url: string;
}

export interface AboutInfo {
  appName: string;
  legalName: string;
  tagline: string;
  websiteUrl: string | null;
  helpCentreUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  addressLines: string[];
  socialLinks: SocialLink[];
  /** "© 2026 <holder>", stamped server-side with the current year. */
  copyright: string;
}

/** A legal document as it appears in the Settings list — no section bodies. */
export interface LegalDocSummary {
  id: string;
  title: string;
  /** ISO date, or null. The screen shows "Last updated …". */
  updatedAt: string | null;
  /** Hosted authoritative copy, when one exists. */
  canonicalUrl: string | null;
}

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDocument extends LegalDocSummary {
  sections: LegalSection[];
}

export interface AppConfig {
  languages: AppLanguage[];
  defaultLanguage: string;
  payments: {
    groups: PaymentCatalogueGroup[];
    methods: PaymentCatalogueMethod[];
  };
  about: AboutInfo;
  legal: LegalDocSummary[];
}

// ─── Wire shapes (all fields optional — reshape fills the gaps) ──────────────

interface RawLanguage {
  code?: string;
  label?: string;
  endonym?: string;
  available?: boolean;
}

interface RawPaymentGroup {
  id?: string;
  title?: string;
  subtitle?: string | null;
  defaultOpen?: boolean;
}

interface RawPaymentMethod {
  id?: string;
  group?: string;
  label?: string;
  hint?: string | null;
  icon?: string;
  tint?: string;
  wire?: string;
}

interface RawAbout {
  appName?: string;
  legalName?: string;
  tagline?: string;
  websiteUrl?: string | null;
  helpCentreUrl?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  addressLines?: unknown;
  socialLinks?: unknown;
  copyright?: string;
}

interface RawLegalSummary {
  id?: string;
  title?: string;
  updatedAt?: string | null;
  canonicalUrl?: string | null;
}

interface RawConfig {
  languages?: RawLanguage[];
  defaultLanguage?: string;
  payments?: { groups?: RawPaymentGroup[]; methods?: RawPaymentMethod[] };
  about?: RawAbout;
  legal?: RawLegalSummary[];
}

interface RawLegalDocument extends RawLegalSummary {
  sections?: { heading?: string; body?: string }[];
}

// ─── Reshape ────────────────────────────────────────────────────────────────

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v.trim() ? v : fallback;

const nullableStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null;

function reshapeAbout(a: RawAbout | undefined): AboutInfo {
  const addressLines = Array.isArray(a?.addressLines)
    ? a!.addressLines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    : [];
  const socialLinks = Array.isArray(a?.socialLinks)
    ? (a!.socialLinks as unknown[])
        .map((l) => l as { id?: unknown; label?: unknown; url?: unknown })
        .filter((l) => typeof l.url === 'string' && (l.url as string).trim().length > 0)
        .map((l, i) => ({
          id: str(l.id, `link-${i}`),
          label: str(l.label, 'Link'),
          url: l.url as string,
        }))
    : [];
  return {
    appName: str(a?.appName, 'Yulo Stores'),
    legalName: str(a?.legalName, str(a?.appName, 'Yulo Stores')),
    tagline: str(a?.tagline),
    websiteUrl: nullableStr(a?.websiteUrl),
    helpCentreUrl: nullableStr(a?.helpCentreUrl),
    supportEmail: nullableStr(a?.supportEmail),
    supportPhone: nullableStr(a?.supportPhone),
    addressLines,
    socialLinks,
    copyright: str(a?.copyright),
  };
}

function reshapeConfig(c: RawConfig | undefined): AppConfig {
  const languages = (c?.languages ?? [])
    .filter((l): l is RawLanguage => !!l && typeof l.code === 'string')
    .map((l) => ({
      code: l.code as string,
      label: str(l.label, l.code as string),
      endonym: str(l.endonym, str(l.label, l.code as string)),
      available: l.available === true,
    }));

  const groups = (c?.payments?.groups ?? [])
    .filter((g): g is RawPaymentGroup => !!g && typeof g.id === 'string')
    .map((g) => ({
      id: g.id as string,
      title: str(g.title, g.id as string),
      subtitle: nullableStr(g.subtitle),
      defaultOpen: g.defaultOpen === true,
    }));

  const methods = (c?.payments?.methods ?? [])
    .filter((m): m is RawPaymentMethod => !!m && typeof m.id === 'string')
    .map((m) => ({
      id: m.id as string,
      group: str(m.group, 'other'),
      label: str(m.label, m.id as string),
      hint: nullableStr(m.hint),
      icon: str(m.icon, 'card'),
      tint: str(m.tint, '#1C1C1C'),
      wire: m.wire === 'cod' ? ('cod' as const) : ('online' as const),
    }));

  const legal = (c?.legal ?? [])
    .filter((d): d is RawLegalSummary => !!d && typeof d.id === 'string')
    .map((d) => ({
      id: d.id as string,
      title: str(d.title, d.id as string),
      updatedAt: nullableStr(d.updatedAt),
      canonicalUrl: nullableStr(d.canonicalUrl),
    }));

  return {
    languages,
    defaultLanguage: str(c?.defaultLanguage, 'en'),
    payments: { groups, methods },
    about: reshapeAbout(c?.about),
    legal,
  };
}

function reshapeLegalDocument(d: RawLegalDocument | undefined, id: string): LegalDocument {
  const sections = Array.isArray(d?.sections)
    ? d!.sections
        .filter((s) => s && (typeof s.heading === 'string' || typeof s.body === 'string'))
        .map((s) => ({ heading: str(s.heading), body: str(s.body) }))
    : [];
  return {
    id: str(d?.id, id),
    title: str(d?.title, id),
    updatedAt: nullableStr(d?.updatedAt),
    canonicalUrl: nullableStr(d?.canonicalUrl),
    sections,
  };
}

// ─── Fetchers ───────────────────────────────────────────────────────────────

export async function fetchAppConfig(): Promise<AppConfig> {
  const data = await apiGet<{ config: RawConfig }>('/api/app/config');
  return reshapeConfig(data.config);
}

export async function fetchLegalDocument(id: string): Promise<LegalDocument> {
  const data = await apiGet<{ document: RawLegalDocument }>(
    `/api/app/legal/${encodeURIComponent(id)}`,
  );
  return reshapeLegalDocument(data.document, id);
}
