import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export type UrlSafetyCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'CREDENTIALS_NOT_ALLOWED'
  | 'PRIVATE_ADDRESS'
  | 'HOST_NOT_ALLOWED'
  | 'DNS_LOOKUP_FAILED';

export type UrlSafetyResult =
  | { ok: true; normalizedUrl: string; addresses: string[] }
  | { ok: false; code: UrlSafetyCode; message: string };

export interface UrlSafetyPolicy {
  mode: 'development' | 'production';
  demoOrigin?: string;
  allowedHosts?: string[];
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

const ipv4ToNumber = (address: string): number =>
  address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0) >>> 0;

const inV4Range = (address: string, base: string, bits: number): boolean => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
};

const expandIpv6 = (address: string): number[] | null => {
  const withoutZone = address.toLowerCase().split('%')[0] ?? '';
  if (withoutZone.startsWith('::ffff:')) {
    const mapped = withoutZone.slice(7);
    if (isIP(mapped) === 4)
      return [0, 0, 0, 0, 0, 0xffff, ipv4ToNumber(mapped) >>> 16, ipv4ToNumber(mapped) & 0xffff];
  }
  if (isIP(withoutZone) !== 6) return null;
  const [leftRaw, rightRaw] = withoutZone.split('::');
  const parseSide = (value: string | undefined): number[] =>
    value
      ? value
          .split(':')
          .filter(Boolean)
          .map((part) => Number.parseInt(part, 16))
      : [];
  const left = parseSide(leftRaw);
  const right = parseSide(rightRaw);
  return [...left, ...Array<number>(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
};

export const isBlockedIpAddress = (address: string): boolean => {
  const version = isIP(address.includes('%') ? (address.split('%')[0] ?? address) : address);
  if (version === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4]
    ].some(([base, bits]) => inV4Range(address, String(base), Number(bits)));
  }
  const groups = expandIpv6(address);
  if (!groups) return true;
  if (groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff) {
    const mapped = `${(groups[6] ?? 0) >>> 8}.${(groups[6] ?? 0) & 255}.${(groups[7] ?? 0) >>> 8}.${(groups[7] ?? 0) & 255}`;
    return isBlockedIpAddress(mapped);
  }
  const first = groups[0] ?? 0;
  const loopback = groups.slice(0, 7).every((part) => part === 0) && groups[7] === 1;
  const unspecified = groups.every((part) => part === 0);
  return (
    loopback ||
    unspecified ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
};

const defaultResolver = async (hostname: string): Promise<string[]> =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

export const validateTargetUrl = async (
  input: string,
  policy: UrlSafetyPolicy
): Promise<UrlSafetyResult> => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, code: 'INVALID_URL', message: 'Enter a valid absolute URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'UNSUPPORTED_PROTOCOL', message: 'Only HTTP and HTTPS are allowed.' };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: 'CREDENTIALS_NOT_ALLOWED',
      message: 'URLs cannot contain credentials.'
    };
  }
  const exactDemoOrigin =
    policy.mode === 'development' ? normalizeOrigin(policy.demoOrigin ?? '') : null;
  const isExactDemo = exactDemoOrigin !== null && url.origin.toLowerCase() === exactDemoOrigin;
  let addresses: string[];
  try {
    addresses = await (policy.resolveHostname ?? defaultResolver)(url.hostname);
  } catch {
    return { ok: false, code: 'DNS_LOOKUP_FAILED', message: 'The hostname could not be resolved.' };
  }
  if (addresses.length === 0 || (addresses.some(isBlockedIpAddress) && !isExactDemo)) {
    return {
      ok: false,
      code: 'PRIVATE_ADDRESS',
      message: 'Private and local network targets are blocked.'
    };
  }
  if (
    policy.allowedHosts &&
    !policy.allowedHosts.map((host) => host.toLowerCase()).includes(url.hostname.toLowerCase())
  ) {
    return {
      ok: false,
      code: 'HOST_NOT_ALLOWED',
      message: 'Navigation left the approved hostname.'
    };
  }
  return { ok: true, normalizedUrl: url.toString(), addresses };
};

export const validateRedirectUrl = async (
  _fromUrl: string,
  targetUrl: string,
  policy: UrlSafetyPolicy
): Promise<UrlSafetyResult> => validateTargetUrl(targetUrl, policy);
