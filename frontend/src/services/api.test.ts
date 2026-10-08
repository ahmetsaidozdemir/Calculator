import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from './api';

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
