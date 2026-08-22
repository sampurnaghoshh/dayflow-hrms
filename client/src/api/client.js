import { ApiError } from './ApiError.js';
import { mockRequest } from './mocks.js';
import { normalize } from './normalize.js';

// Flip in client/.env (VITE_USE_MOCKS=false) at the Step 5 integration merge.
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

const BASE_URL = '/api';

function buildUrl(path, query) {
  let url = `${BASE_URL}${path}`;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.set(key, value);
    });
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }
  return url;
}

async function errorFromResponse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body at all
  }
  const err = body?.error;
  if (err) {
    return new ApiError(
      err.code ?? 'UNKNOWN_ERROR',
      err.message ?? 'Something went wrong. Please try again.',
      err.details ?? [],
      res.status,
    );
  }
  return new ApiError('UNKNOWN_ERROR', 'Something went wrong. Please try again.', [], res.status);
}

async function request(method, path, { body, query, isMultipart = false } = {}) {
  if (USE_MOCKS) {
    // The mock returns exactly what the real API returns (docs/api-shapes.md) — snake_case
    // row fields, stringified ids/money — so it goes through the same normalize() as a real
    // response. Screens can't tell the difference either way.
    return normalize(await mockRequest(method, path, { body, query }));
  }

  const options = { method, credentials: 'include' };
  if (body !== undefined) {
    if (isMultipart) {
      options.body = body; // caller passes a FormData instance
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
  }

  let res;
  try {
    res = await fetch(buildUrl(path, query), options);
  } catch {
    throw new ApiError('NETWORK_ERROR', "Can't reach the server. Check your connection and try again.", [], 0);
  }

  if (res.status === 204) return null;
  if (!res.ok) throw await errorFromResponse(res);

  try {
    return normalize(await res.json());
  } catch {
    return null;
  }
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body, opts = {}) => request('POST', path, { body, ...opts }),
  patch: (path, body, opts = {}) => request('PATCH', path, { body, ...opts }),
  del: (path, query) => request('DELETE', path, { query }),
};
