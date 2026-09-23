import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ user: null, profile: null, loading: true });
  useEffect(() => {
    api('/me')
      .then((value) => setAuth({ ...value, loading: false }))
      .catch((error) =>
        setAuth({
          user: null,
          profile: null,
          loading: false,
          error:
            error.status === 401
              ? null
              : 'The server is unavailable. Please check your connection and refresh.',
        }),
      );
  }, []);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    setAuth({ user: null, profile: null, loading: false });
  };
  return (
    <AuthContext.Provider
      value={{
        ...auth,
        setAuth: (value) => setAuth((prev) => ({ ...prev, ...value, loading: false })),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
