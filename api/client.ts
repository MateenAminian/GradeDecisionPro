import { Platform } from 'react-native';
import type { AnalyzeBatchResponse, AnalyzeBatchOptions, CardMetadata, CompPrices, CompSnapshot } from '@/data/types';

const DEFAULT_API_URL = 'http://localhost:8000';

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '';
  }
  return DEFAULT_API_URL;
}

export async function checkApiHealth(): Promise<{ status: string; visionConfigured: boolean }> {
  const base = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}/health`);
  } catch {
    throw new Error(
      `Can't reach the analysis server at ${base}. Start the backend, then try again.`,
    );
  }

  let payload: { status?: string; visionConfigured?: boolean } = {};
  try {
    payload = (await response.json()) as { status?: string; visionConfigured?: boolean };
  } catch {
    throw new Error(`The analysis server at ${base} is running but returned an unexpected health response.`);
  }

  if (!response.ok) {
    throw new Error(`Analysis server health check failed (${response.status}).`);
  }
  if (!payload.visionConfigured) {
    throw new Error(
      'Card scanning is not configured. Add OPENROUTER_API_KEY to backend/.env and restart the API.',
    );
  }
  return {
    status: payload.status || 'ok',
    visionConfigured: true,
  };
}

function filenameFor(uri: string, index: number): string {
  const cleaned = uri.split('?')[0] ?? uri;
  const leaf = cleaned.split('/').pop() || `card-${index + 1}.jpg`;
  return /\.(jpe?g|png|webp|gif|heic)$/i.test(leaf) ? leaf : `card-${index + 1}.jpg`;
}

function mimeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

async function appendImage(form: FormData, uri: string, index: number) {
  const name = filenameFor(uri, index);
  const type = mimeFor(name);

  if (Platform.OS === 'web' || uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http')) {
    const res = await fetch(uri);
    const blob = await res.blob();
    form.append('files', blob, name);
    return;
  }

  form.append('files', { uri, name, type } as unknown as Blob);
}

function friendlyAnalyzeError(raw: string, status?: number): string {
  const text = raw.toLowerCase();
  if (text.includes('openrouter_api_key is not configured')) {
    return 'Card scanning is not configured. Add OPENROUTER_API_KEY to backend/.env and restart the API.';
  }
  if (status === 401 || text.includes('openrouter http 401')) {
    return 'The vision API key was rejected. Check OPENROUTER_API_KEY in backend/.env.';
  }
  if (status === 429 || text.includes('openrouter http 429')) {
    return 'The vision service is rate-limited. Wait a moment, or scan fewer cards at once.';
  }
  if (text.includes('failed to fetch') || text.includes('network request failed')) {
    return `Can't reach the analysis server at ${getApiBaseUrl()}. Start the backend, then try again.`;
  }
  return raw;
}

export async function analyzeBatchImages(
  imageUris: string[],
  options: AnalyzeBatchOptions,
): Promise<AnalyzeBatchResponse> {
  if (!imageUris.length) {
    throw new Error('Pick at least one card photo');
  }

  await checkApiHealth();

  const form = new FormData();
  for (let i = 0; i < imageUris.length; i += 1) {
    await appendImage(form, imageUris[i], i);
  }

  form.append('gradingFee', String(options.gradingFee));
  form.append('shippingCost', String(options.shippingCost));
  form.append('turnaroundDays', String(options.turnaroundDays));
  form.append('rawValue', String(options.rawValue));
  form.append('psa10Comp', String(options.psa10Comp));
  form.append('psa9Comp', String(options.psa9Comp));
  form.append('psa8Comp', String(options.psa8Comp));
  form.append('below8Comp', String(options.below8Comp));

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/v1/analyze-batch`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new Error(
      `Can't reach the analysis server at ${getApiBaseUrl()}. Start the backend, then try again.`,
    );
  }

  const text = await response.text();
  let payload: AnalyzeBatchResponse | { detail?: unknown };
  try {
    payload = JSON.parse(text) as AnalyzeBatchResponse;
  } catch {
    throw new Error(response.ok ? 'The server returned an unreadable response' : `Analyze failed (${response.status})`);
  }

  if (!response.ok) {
    const detail = (payload as { detail?: unknown }).detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: string }).msg) : String(d))).join('; ')
          : `Analyze failed (${response.status})`;
    throw new Error(friendlyAnalyzeError(message, response.status));
  }

  return payload as AnalyzeBatchResponse;
}

export async function lookupEbayComps(
  meta: CardMetadata,
  options?: { fallback?: CompPrices; refresh?: boolean },
): Promise<CompSnapshot> {
  const base = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/ebay/comps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: meta.year ?? '',
        player: meta.player ?? '',
        set: meta.set ?? '',
        cardNumber: meta.cardNumber ?? '',
        parallel: meta.parallel ?? '',
        refresh: options?.refresh ?? true,
        fallback: options?.fallback,
      }),
    });
  } catch {
    throw new Error(
      `Can't reach the analysis server at ${base}. Start the backend, then try again.`,
    );
  }

  const text = await response.text();
  let payload: CompSnapshot | { detail?: unknown };
  try {
    payload = JSON.parse(text) as CompSnapshot;
  } catch {
    throw new Error(response.ok ? 'The server returned an unreadable response' : `eBay comps failed (${response.status})`);
  }

  if (!response.ok) {
    const detail = (payload as { detail?: unknown }).detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: string }).msg) : String(d))).join('; ')
          : `eBay comps failed (${response.status})`;
    throw new Error(message);
  }

  return payload as CompSnapshot;
}

export async function lookupSoldComps(
  meta: CardMetadata,
  options?: { fallback?: CompPrices; refresh?: boolean },
): Promise<CompSnapshot> {
  const base = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/cardsight/comps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: meta.year ?? '',
        player: meta.player ?? '',
        set: meta.set ?? '',
        cardNumber: meta.cardNumber ?? '',
        parallel: meta.parallel ?? '',
        refresh: options?.refresh ?? false,
        fallback: options?.fallback,
      }),
    });
  } catch {
    throw new Error(
      `Can't reach the analysis server at ${base}. Start the backend, then try again.`,
    );
  }

  const text = await response.text();
  let payload: CompSnapshot | { detail?: unknown };
  try {
    payload = JSON.parse(text) as CompSnapshot;
  } catch {
    throw new Error(response.ok ? 'The server returned an unreadable response' : `Sold comps failed (${response.status})`);
  }

  if (!response.ok) {
    const detail = (payload as { detail?: unknown }).detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: string }).msg) : String(d))).join('; ')
          : `Sold comps failed (${response.status})`;
    throw new Error(message);
  }

  return payload as CompSnapshot;
}
