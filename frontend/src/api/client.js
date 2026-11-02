const TOKEN_KEY = 'bonmatch.token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readToken();
let onUnauthorized = null;

export const getToken = () => token;

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Archiviazione non disponibile (navigazione privata): il token resta in memoria.
  }
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/** Errore dell'API con codice HTTP, messaggio in italiano ed errori per campo. */
export class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message || 'Qualcosa è andato storto.');
    this.status = status;
    this.code = error.code;
    this.fields = error.fields || {};
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { code: 'NETWORK', message: 'Connessione assente: controlla la rete e riprova.' });
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized?.();
    throw new ApiError(res.status, data?.error);
  }
  return data;
}
