import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate, REQUEST_TIMEOUT_MS } from './api';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calculate', () => {
  it('POSTs the operation and operands as JSON and returns the result', async () => {
    const fetchMock = stubFetch(jsonResponse({ operation: 'add', result: 3 }));

    await expect(calculate('add', [1, 2])).resolves.toBe(3);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/calculate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"operation":"add","a":1,"b":2}',
      }),
    );
  });

  it('omits b for unary operations', async () => {
    const fetchMock = stubFetch(jsonResponse({ operation: 'sqrt', result: 3 }));

    await calculate('sqrt', [9]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: '{"operation":"sqrt","a":9}' }),
    );
  });

  it('turns an API error body into an ApiError', async () => {
    stubFetch(jsonResponse({ error: { code: 'division_by_zero', message: 'cannot divide by zero' } }, 422));

    const failure = calculate('divide', [1, 0]);

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      code: 'division_by_zero',
      message: 'cannot divide by zero',
      status: 422,
    });
  });

  it('reports a non-JSON error response (e.g. a proxy error page) as unexpected', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

    await expect(calculate('add', [1, 2])).rejects.toMatchObject({
      code: 'unexpected_response',
      status: 502,
      message: expect.stringContaining('502'),
    });
  });

  it('rejects a 200 response that has no numeric result', async () => {
    stubFetch(jsonResponse({ result: 'three' }));

    await expect(calculate('add', [1, 2])).rejects.toMatchObject({ code: 'unexpected_response' });
  });

  it('reports network failures as network_error', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    await expect(calculate('add', [1, 2])).rejects.toMatchObject({ code: 'network_error' });
  });
});

describe('calculate timeout', () => {
  /** A fetch that never answers on its own and rejects with AbortError once its signal fires, like the real one. */
  function stubHungFetch() {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up after 5 seconds with a timeout error', async () => {
    vi.useFakeTimers();
    stubHungFetch();

    const failure = expect(calculate('add', [1, 2])).rejects.toMatchObject({
      code: 'timeout',
      message: expect.stringContaining('did not respond'),
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    await failure;
    expect(REQUEST_TIMEOUT_MS).toBe(5000);
  });

  it('aborts the underlying request only once the timeout has elapsed', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHungFetch();

    const failure = expect(calculate('add', [1, 2])).rejects.toMatchObject({ code: 'timeout' });
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    await failure;
  });

  it('times out when the server sends headers but stalls on the body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      })),
    );

    const failure = expect(calculate('add', [1, 2])).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    await failure;
  });

  it('clears the timer once a response arrives, so nothing fires later', async () => {
    vi.useFakeTimers();
    stubFetch(jsonResponse({ operation: 'add', result: 3 }));

    await expect(calculate('add', [1, 2])).resolves.toBe(3);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the request fails for another reason', async () => {
    vi.useFakeTimers();
    stubFetch(new TypeError('Failed to fetch'));

    await expect(calculate('add', [1, 2])).rejects.toMatchObject({ code: 'network_error' });

    expect(vi.getTimerCount()).toBe(0);
  });
});
