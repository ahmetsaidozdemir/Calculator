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

describe('calculate cancellation', () => {
  /** Rejects with AbortError when the request's signal fires, like the real fetch. */
  function stubHungFetch() {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const fail = () => reject(new DOMException('aborted', 'AbortError'));
        // A real fetch rejects straight away when handed a signal that is already aborted.
        if (init?.signal?.aborted) fail();
        else init?.signal?.addEventListener('abort', fail);
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts the underlying request when the caller aborts, reporting `aborted` rather than `timeout`', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHungFetch();
    const caller = new AbortController();

    const failure = expect(calculate('add', [1, 2], caller.signal)).rejects.toMatchObject({ code: 'aborted' });
    const requestSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(requestSignal.aborted).toBe(false);

    caller.abort();

    await failure;
    expect(requestSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with `aborted` when the caller signal is already aborted', async () => {
    vi.useFakeTimers();
    const fetchMock = stubHungFetch();
    const caller = new AbortController();
    caller.abort();

    await expect(calculate('add', [1, 2], caller.signal)).rejects.toMatchObject({ code: 'aborted' });

    // The request is handed an already-aborted signal, so it never goes out.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('reports `aborted` when the caller aborts while the body is being read', async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          caller.abort();
          return { result: 3 };
        },
      })),
    );

    await expect(calculate('add', [1, 2], caller.signal)).rejects.toMatchObject({ code: 'aborted' });
  });

  it('still times out when a caller signal is supplied', async () => {
    vi.useFakeTimers();
    stubHungFetch();
    const caller = new AbortController();

    const failure = expect(calculate('add', [1, 2], caller.signal)).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    await failure;
  });

  it('detaches its listener from the caller signal once finished', async () => {
    stubFetch(jsonResponse({ result: 3 }));
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');

    await expect(calculate('add', [1, 2], caller.signal)).resolves.toBe(3);

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
