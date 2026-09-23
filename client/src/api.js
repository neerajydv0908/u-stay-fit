export async function api(path, { method = 'GET', body, ...options } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Unable to connect. Please try again.');
    error.status = response.status;
    error.fields = result.fields;
    error.data = result; // e.g. { unverified: true } or { restart: true }
    throw error;
  }
  return result;
}
