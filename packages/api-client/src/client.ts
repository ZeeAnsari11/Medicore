import { ApiError } from './api-error';
import { TokenStorage, createInMemoryTokenStorage } from './token-storage';

export interface ApiClientOptions {
  baseUrl: string;
  tokenStorage?: TokenStorage;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false for endpoints that don't require (or predate) a session token. */
  auth?: boolean;
}

export interface ApiClient {
  apiFetch<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  apiFetchBlob(path: string, options?: ApiRequestOptions): Promise<Blob>;
  tokenStorage: TokenStorage;
}

export function createApiClient({ baseUrl, tokenStorage = createInMemoryTokenStorage() }: ApiClientOptions): ApiClient {
  async function rawFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
    const { body, auth = true, headers, ...rest } = options;

    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string>),
    };

    if (auth) {
      const token = await tokenStorage.getToken();
      if (token) {
        finalHeaders.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let message: string = response.statusText;
      let errorBody: unknown;
      try {
        const data = await response.json();
        errorBody = data;
        message = data?.message ?? message;
      } catch {
        // response had no JSON body
      }
      throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message, errorBody);
    }

    return response;
  }

  async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await rawFetch(path, options);
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  async function apiFetchBlob(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
    const response = await rawFetch(path, options);
    return response.blob();
  }

  return { apiFetch, apiFetchBlob, tokenStorage };
}
