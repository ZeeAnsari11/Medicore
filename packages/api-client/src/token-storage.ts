/**
 * Storage is intentionally async-capable: web/desktop back this with
 * localStorage (sync), mobile will eventually back it with SecureStore/
 * AsyncStorage (async). The client always awaits both without caring which.
 */
export interface TokenStorage {
  getToken(): string | null | Promise<string | null>;
  setToken(token: string | null): void | Promise<void>;
}

export function createInMemoryTokenStorage(): TokenStorage {
  let token: string | null = null;
  return {
    getToken: () => token,
    setToken: (next) => {
      token = next;
    },
  };
}
