'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Me } from './types';

const MeContext = createContext<{ me: Me | null; refresh: () => Promise<void> }>({
  me: null,
  refresh: async () => {},
});

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/auth/me'));
    } catch {
      /* api() redirects to sign-in on 401 */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <MeContext.Provider value={{ me, refresh }}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);
