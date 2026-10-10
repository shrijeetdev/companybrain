// SSRF guard for server-side fetches of user-supplied URLs (ICS feeds).
//
// - Only http/https (webcal:// → https://). No credentials in the URL.
// - Every resolved address must be public: loopback, private, link-local, CGNAT, multicast,
//   reserved, documentation, and IPv6 local/mapped/NAT64/6to4 forms of those are rejected.
// - The connection is pinned to the vetted IP (custom `lookup`), so DNS rebinding between
//   the check and the connect can't redirect us.
// - Redirects are followed manually (max 3), each hop re-validated. 5 MB cap, 15 s budget.

import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import zlib from 'node:zlib';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const defaultResolver: Resolver = async (hostname) => {
  const res = await dnsLookup(hostname, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

// ── IP parsing ───────────────────────────────────────────────────────────────

function parseIPv4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** Expand an IPv6 address (with optional embedded IPv4 and zone id) to 16 bytes. */
function parseIPv6(input: string): number[] | null {
  let s = input.toLowerCase();
  const pct = s.indexOf('%');
  if (pct >= 0) s = s.slice(0, pct);
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    s = `${s.slice(0, lastColon + 1)}0:0`; // placeholder groups, replaced below
  }
  const dbl = s.split('::');
  if (dbl.length > 2) return null;
  const head = dbl[0] ? dbl[0].split(':') : [];
  const rest = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (dbl.length === 1 && missing !== 0) return null;
  if (dbl.length === 2 && missing < 1) return null;
  const groups = [...head, ...Array<string>(dbl.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = Number.parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length === 4) bytes.splice(12, 4, ...tail);
  return bytes;
}

function v4InCidr(ip: number[], base: string, bits: number): boolean {
  const b = parseIPv4(base)!;
  const a = ((ip[0]! << 24) | (ip[1]! << 16) | (ip[2]! << 8) | ip[3]!) >>> 0;
  const c = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (c & mask);
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata!)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function isBlockedV4(ip: number[]): boolean {
  return BLOCKED_V4.some(([base, bits]) => v4InCidr(ip, base, bits));
}

function isBlockedV6(b: number[]): boolean {
  const allZeroUntil = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (allZeroUntil(16)) return true; // ::
  if (allZeroUntil(15) && b[15] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d → check the embedded IPv4.
  if (allZeroUntil(10) && b[10] === 0xff && b[11] === 0xff) return isBlockedV4(b.slice(12));
  if (allZeroUntil(12)) return isBlockedV4(b.slice(12));
  // IPv4-translated ::ffff:0:a.b.c.d
  if (allZeroUntil(8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return isBlockedV4(b.slice(12));
  // NAT64 64:ff9b::/96 and 64:ff9b:1::/48 → embedded IPv4.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return isBlockedV4(b.slice(12));
  // 6to4 2002::/16 → embedded IPv4 in bytes 2..5.
  if (b[0] === 0x20 && b[1] === 0x02) return isBlockedV4(b.slice(2, 6));
  // Teredo 2001:0::/32 — obfuscated client IPv4; just block.
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true;
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 docs
  if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0)) return true; // 100::/64 discard
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return true; // fec0::/10 site-local (deprecated)
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** true when the literal IP address is not publicly routable (or unparsable). */
export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address.replace(/^\[|\]$/g, '').split('%')[0] ?? '');
  if (kind === 4) {
    const v4 = parseIPv4(address);
    return !v4 || isBlockedV4(v4);
  }
  if (kind === 6) {
    const v6 = parseIPv6(address);
    return !v6 || isBlockedV6(v6);
  }
  return true;
}

// ── URL validation ───────────────────────────────────────────────────────────

export interface VettedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/** webcal:// and webcals:// → https:// (as calendar apps do). */
export function normalizeFeedUrl(raw: string): string {
  const t = raw.trim();
  return t.replace(/^webcals?:\/\//i, 'https://');
}

const BLOCKED_HOSTNAMES = /(^|\.)(localhost|localdomain|internal|local|home\.arpa)$/i;

/**
 * Parse + validate a URL and resolve its host to a vetted public IP.
 * Note the WHATWG URL parser canonicalises numeric hosts: `http://2130706433/`,
 * `http://0x7f.1/` and `http://017700000001/` all become `127.0.0.1` and are rejected.
 */
export async function vetUrl(raw: string, resolve: Resolver = defaultResolver): Promise<VettedTarget> {
  let url: URL;
  try {
    url = new URL(normalizeFeedUrl(raw));
  } catch {
    throw new SsrfError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SsrfError('Only http(s) URLs are allowed');
  if (url.username || url.password) throw new SsrfError('Credentials in URLs are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw new SsrfError('Missing host');
  if (url.port && !/^\d+$/.test(url.port)) throw new SsrfError('Invalid port');

  const literal = isIP(host);
  if (literal) {
    if (isBlockedAddress(host)) throw new SsrfError('Address is not allowed');
    return { url, address: host, family: literal === 6 ? 6 : 4 };
  }
  if (BLOCKED_HOSTNAMES.test(host)) throw new SsrfError('Host is not allowed');
  let addrs: ResolvedAddress[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new SsrfError('Could not resolve host');
  }
  if (!addrs.length) throw new SsrfError('Could not resolve host');
  for (const a of addrs) {
    if (isBlockedAddress(a.address)) throw new SsrfError('Host resolves to a non-public address');
  }
  const first = addrs[0]!;
  return { url, address: first.address, family: first.family };
}

// ── Pinned HTTP transport ────────────────────────────────────────────────────

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}
/** Performs one request to `target.url`, connecting ONLY to `target.address`. */
export type Transport = (target: VettedTarget, opts: { maxBytes: number; signal: AbortSignal }) => Promise<RawResponse>;

export const nodeTransport: Transport = (target, { maxBytes, signal }) =>
  new Promise<RawResponse>((resolvePromise, reject) => {
    const { url, address, family } = target;
    const mod = url.protocol === 'https:' ? https : http;
    // Pin the socket to the vetted IP whatever DNS says now (anti-rebinding).
    const lookup = (_h: string, opts: unknown, cb: (...a: unknown[]) => void) => {
      const all = typeof opts === 'object' && opts !== null && (opts as { all?: boolean }).all;
      if (all) cb(null, [{ address, family }]);
      else cb(null, address, family);
    };
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: lookup as never,
        agent: false,
        signal,
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'companybrain-calendar/2 (+ics sync)',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers = res.headers as RawResponse['headers'];
        if (status >= 300 && status < 400) {
          res.resume();
          resolvePromise({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          reject(new SsrfError('Response too large'));
          return;
        }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        stream.on('data', (c: Buffer) => {
          if (done) return;
          size += c.length;
          if (size > maxBytes) {
            done = true;
            res.destroy();
            reject(new SsrfError('Response too large'));
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => {
          if (done) return;
          done = true;
          resolvePromise({ status, headers, body: Buffer.concat(chunks) });
        });
        const fail = (e: unknown) => {
          if (done) return;
          done = true;
          reject(e instanceof Error ? e : new Error(String(e)));
        };
        stream.on('error', fail);
        if (stream !== res) res.on('error', fail);
        res.on('aborted', () => fail(new Error('Connection aborted')));
      },
    );
    req.on('error', reject);
    req.end();
  });

export interface SafeFetchOptions {
  resolve?: Resolver;
  transport?: Transport;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

/** SSRF-safe GET returning the body as text. Throws SsrfError / Error on any problem. */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}): Promise<string> {
  const resolve = opts.resolve ?? defaultResolver;
  const transport = opts.transport ?? nodeTransport;
  const maxRedirects = opts.maxRedirects ?? 3;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = await vetUrl(current, resolve);
    if (signal.aborted) throw new Error('Request timed out');
    let res: RawResponse;
    try {
      res = await transport(target, { maxBytes, signal });
    } catch (e) {
      if (signal.aborted) throw new Error('Request timed out');
      throw e;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location;
      const location = Array.isArray(loc) ? loc[0] : loc;
      if (!location) throw new Error(`Redirect (HTTP ${res.status}) without Location`);
      if (hop === maxRedirects) throw new SsrfError('Too many redirects');
      current = new URL(location, target.url).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`Feed returned HTTP ${res.status}`);
    if (res.body.length > maxBytes) throw new SsrfError('Response too large');
    return res.body.toString('utf8');
  }
  throw new SsrfError('Too many redirects');
}
