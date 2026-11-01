export class AccountApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export async function accountRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/account" + path, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.csrf ? { "X-Account-CSRF": options.csrf } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new AccountApiError(
      "NETWORK_ERROR",
      "Couldn’t connect. Check your connection and try again.",
    );
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = value?.error;
    throw new AccountApiError(
      error?.code || "ACCOUNT_UNAVAILABLE",
      error?.message || "Accounts are temporarily unavailable.",
      response.status,
      Number(response.headers.get("Retry-After")) || 0,
    );
  }
  if (!value || typeof value !== "object")
    throw new AccountApiError(
      "INVALID_RESPONSE",
      "Your account response could not be read. Try again.",
    );
  return value as T;
}
export function safeAccountReturn(input: string | null): string {
  if (
    !input ||
    input.length > 4500 ||
    !input.startsWith("/app/") ||
    input.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(input)
  )
    return "/app/shelf";
  try {
    const decoded = decodeURIComponent(input);
    if (
      /[\\\u0000-\u001f]/.test(decoded) ||
      decoded.split(/[/?#]/).includes("..") ||
      decoded.startsWith("/app/account/")
    )
      return "/app/shelf";
    return input;
  } catch {
    return "/app/shelf";
  }
}
