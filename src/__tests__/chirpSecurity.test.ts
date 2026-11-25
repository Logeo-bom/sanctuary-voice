import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/chirp-transcribe';

const code = 'a'.repeat(40);

async function request(method: string, authorization?: string, body: unknown = {}) {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  await handler({ method, headers: { authorization }, body } as VercelRequest, res as unknown as VercelResponse);
  return res.status.mock.calls[0][0];
}

describe('Chirp endpoint access', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fails closed without a strong configured code', async () => {
    vi.stubEnv('CHIRP_OPERATOR_ACCESS_CODE', '');
    expect(await request('POST')).toBe(503);
    vi.stubEnv('CHIRP_OPERATOR_ACCESS_CODE', 'short');
    expect(await request('POST')).toBe(503);
  });

  it('rejects unauthorized and unsupported methods before contacting Google', async () => {
    vi.stubEnv('CHIRP_OPERATOR_ACCESS_CODE', code);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await request('POST')).toBe(401);
    expect(await request('POST', 'Bearer wrong')).toBe(401);
    expect(await request('GET', `Bearer ${code}`)).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates input after authorization', async () => {
    vi.stubEnv('CHIRP_OPERATOR_ACCESS_CODE', code);
    expect(await request('POST', `Bearer ${code}`, { audioBase64: '!' })).toBe(400);
    expect(await request('POST', `Bearer ${code}`, { audioBase64: 'a'.repeat(1500004) })).toBe(400);
    expect(await request('POST', `Bearer ${code}`, { audioBase64: 'YWJj', languageCode: 'en-US' })).toBe(400);
    vi.stubEnv('GOOGLE_CHIRP_SERVICE_ACCOUNT_KEY', '');
    expect(await request('POST', `Bearer ${code}`, { audioBase64: 'YWJj' })).toBe(500);
  });
});