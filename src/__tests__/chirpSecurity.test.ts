import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
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

describe('Chirp speech adaptation fail-open retry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries without adaptation when Google rejects the adaptation config', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const serviceAccountKey = Buffer.from(JSON.stringify({
      client_email: 'test@example.com',
      private_key: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      project_id: 'test-project',
    })).toString('base64');
    vi.stubEnv('CHIRP_OPERATOR_ACCESS_CODE', code);
    vi.stubEnv('GOOGLE_CHIRP_SERVICE_ACCOUNT_KEY', serviceAccountKey);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Invalid adaptation phrase set' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ alternatives: [{ transcript: 'Buhaton ta kini', confidence: 0.9 }] }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const status = await request('POST', `Bearer ${code}`, { audioBase64: 'YWJj' });
    expect(status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondCallBody.config.adaptation).toBeDefined();
    const thirdCallBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(thirdCallBody.config.adaptation).toBeUndefined();
  });
});