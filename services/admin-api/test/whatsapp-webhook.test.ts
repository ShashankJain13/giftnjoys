import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../src/context';
import { verifySignature, whatsappWebhookRoutes } from '../src/routes/whatsapp-webhook';

function fakeContext(env: Partial<AppContext['env']>): AppContext {
  return {
    env: { WHATSAPP_VERIFY_TOKEN: undefined, WHATSAPP_APP_SECRET: undefined, ...env } as AppContext['env'],
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as AppContext;
}

describe('verifySignature', () => {
  it('accepts a correctly signed body', () => {
    const body = '{"hello":"world"}';
    const secret = 'app-secret';
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, or a missing/malformed header', () => {
    const body = '{"hello":"world"}';
    const secret = 'app-secret';
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifySignature('{"hello":"tampered"}', sig, secret)).toBe(false);
    expect(verifySignature(body, sig, 'wrong-secret')).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, 'not-even-prefixed', secret)).toBe(false);
  });
});

describe('WhatsApp webhook route', () => {
  it('echoes the challenge only when the verify token matches', async () => {
    const app = whatsappWebhookRoutes(fakeContext({ WHATSAPP_VERIFY_TOKEN: 'secret-token' }));

    const ok = await app.request('/?hub.mode=subscribe&hub.verify_token=secret-token&hub.challenge=12345');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('12345');

    const wrongToken = await app.request('/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345');
    expect(wrongToken.status).toBe(403);
  });

  it('rejects POSTs without a valid signature before touching any data', async () => {
    const app = whatsappWebhookRoutes(fakeContext({ WHATSAPP_APP_SECRET: 'app-secret' }));

    const noSignature = await app.request('/', { method: 'POST', body: '{}' });
    expect(noSignature.status).toBe(401);

    const body = JSON.stringify({ entry: [] });
    const badSig = await app.request('/', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': 'sha256=0000' },
    });
    expect(badSig.status).toBe(401);
  });

  it('accepts a correctly signed empty batch', async () => {
    const secret = 'app-secret';
    const app = whatsappWebhookRoutes(fakeContext({ WHATSAPP_APP_SECRET: secret }));
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const res = await app.request('/', { method: 'POST', body, headers: { 'x-hub-signature-256': sig } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
