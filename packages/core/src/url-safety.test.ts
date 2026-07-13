import { describe, expect, it, vi } from 'vitest';

import { isBlockedIpAddress, validateRedirectUrl, validateTargetUrl } from './url-safety';

const publicResolver = vi.fn(async () => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);

describe('isBlockedIpAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1'
  ])('blocks non-public address %s', (address) => {
    expect(isBlockedIpAddress(address)).toBe(true);
  });

  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => {
      expect(isBlockedIpAddress(address)).toBe(false);
    }
  );
});

describe('validateTargetUrl', () => {
  it.each(['file:///etc/passwd', 'ftp://example.com/file', 'data:text/plain,hello'])(
    'rejects unsupported protocol in %s',
    async (url) => {
      await expect(
        validateTargetUrl(url, { mode: 'production', resolveHostname: publicResolver })
      ).resolves.toMatchObject({
        ok: false,
        code: 'UNSUPPORTED_PROTOCOL'
      });
    }
  );

  it('rejects embedded credentials', async () => {
    await expect(
      validateTargetUrl('https://admin:secret@example.com', {
        mode: 'production',
        resolveHostname: publicResolver
      })
    ).resolves.toMatchObject({ ok: false, code: 'CREDENTIALS_NOT_ALLOWED' });
  });

  it('rejects a hostname if any resolved address is blocked', async () => {
    const resolveHostname = vi.fn(async () => ['93.184.216.34', '10.0.0.9']);

    await expect(
      validateTargetUrl('https://example.com', { mode: 'production', resolveHostname })
    ).resolves.toMatchObject({ ok: false, code: 'PRIVATE_ADDRESS' });
  });

  it('rejects localhost in production', async () => {
    const resolveHostname = vi.fn(async () => ['127.0.0.1']);

    await expect(
      validateTargetUrl('http://localhost:4174', { mode: 'production', resolveHostname })
    ).resolves.toMatchObject({ ok: false, code: 'PRIVATE_ADDRESS' });
  });

  it('allows only the exact configured demo origin in development', async () => {
    const resolveHostname = vi.fn(async () => ['127.0.0.1']);
    const policy = {
      mode: 'development' as const,
      demoOrigin: 'http://localhost:4174',
      resolveHostname
    };

    await expect(validateTargetUrl('http://localhost:4174/pricing', policy)).resolves.toMatchObject(
      {
        ok: true,
        normalizedUrl: 'http://localhost:4174/pricing'
      }
    );
    await expect(validateTargetUrl('http://localhost:9999/pricing', policy)).resolves.toMatchObject(
      {
        ok: false,
        code: 'PRIVATE_ADDRESS'
      }
    );
  });

  it('normalizes an allowed public URL', async () => {
    await expect(
      validateTargetUrl('HTTPS://Example.COM:443/path#section', {
        mode: 'production',
        resolveHostname: publicResolver
      })
    ).resolves.toMatchObject({ ok: true, normalizedUrl: 'https://example.com/path#section' });
  });
});

describe('validateRedirectUrl', () => {
  it('revalidates DNS and rejects redirects to private addresses', async () => {
    const resolveHostname = vi.fn(async (hostname: string) =>
      hostname === 'example.com' ? ['93.184.216.34'] : ['169.254.169.254']
    );

    await expect(
      validateRedirectUrl('https://example.com/start', 'http://metadata.internal/latest', {
        mode: 'production',
        allowedHosts: ['example.com', 'metadata.internal'],
        resolveHostname
      })
    ).resolves.toMatchObject({ ok: false, code: 'PRIVATE_ADDRESS' });
  });

  it('rejects a safe public redirect outside the approved hosts', async () => {
    await expect(
      validateRedirectUrl('https://example.com/start', 'https://other.example/path', {
        mode: 'production',
        allowedHosts: ['example.com'],
        resolveHostname: publicResolver
      })
    ).resolves.toMatchObject({ ok: false, code: 'HOST_NOT_ALLOWED' });
  });
});
