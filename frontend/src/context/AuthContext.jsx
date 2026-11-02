import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(getToken());
  const [ready, setReady] = useState(!getToken());
  // Distingue l'uscita volontaria (si torna alla landing) dalla sessione scaduta (si va al login).
  const [loggedOut, setLoggedOut] = useState(false);

  const clear = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
  }, [clear]);

  useEffect(() => {
    if (!token || user) return;
    api('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => clear())
      .finally(() => setReady(true));
  }, [token, user, clear]);

  const start = useCallback((res) => {
    setLoggedOut(false);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    setReady(true);
    return res.user;
  }, []);

  const login = useCallback(async (email, password) => start(await api('/auth/login', { method: 'POST', body: { email, password } })), [start]);

  const register = useCallback(async (data) => start(await api('/auth/register', { method: 'POST', body: data })), [start]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setLoggedOut(true);
      clear();
    }
  }, [clear]);

  const updateProfile = useCallback(async (data) => {
    const res = await api('/users/me', { method: 'PATCH', body: data });
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(
    () => ({ user, token, ready, loggedOut, login, register, logout, updateProfile, nicknameMode: user?.settings?.nicknameMode || 'accanto' }),
    [user, token, ready, loggedOut, login, register, logout, updateProfile]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
