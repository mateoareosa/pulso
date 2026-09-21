import { afterEach, describe, expect, it, vi } from 'vitest';
import { purchasesApi } from '../src/features/purchases/services/purchases-api';

describe('purchasesApi update concurrency metadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the exact draft version in If-Match without violating the strict body contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'pur-1', version: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await purchasesApi.updateDraft('pur-1', {
      documentNumber: 'FAC-2',
      paymentSource: 'UNSPECIFIED',
      version: 4,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/purchases/pur-1',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: expect.any(Headers),
        body: JSON.stringify({ documentNumber: 'FAC-2', paymentSource: 'UNSPECIFIED' }),
      })
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get('If-Match')).toBe('4');
  });
});
