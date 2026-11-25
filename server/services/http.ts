/**
 * Shared timeout-enforced fetch helpers for external environmental telemetry providers.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<T> {
  const resp = await fetchWithTimeout(url, init, timeoutMs);
  if (!resp.ok) {
    throw new Error(`Upstream HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}
