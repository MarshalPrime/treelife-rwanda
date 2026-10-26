import type { FieldErrors } from "@/lib/validation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "treelife.token";

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldErrors;

  constructor(message: string, status: number, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as {
    detail?: string;
    errors?: { field?: string; message?: string }[];
  };
  if (!response.ok) {
    const fieldErrors: FieldErrors = {};
    for (const error of data.errors ?? []) {
      if (error.field && error.message) fieldErrors[error.field] = error.message;
    }
    if (response.status === 401 && !path.startsWith("/auth/login")) clearToken();
    const message =
      data.detail ||
      (Object.values(fieldErrors)[0] ?? "The request could not be completed.");
    throw new ApiError(message, response.status, fieldErrors);
  }
  return data as T;
}
