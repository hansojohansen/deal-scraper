import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api, type User } from "../api/client";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // Restore session from HttpOnly cookie on mount
  useEffect(() => {
    api.auth.getMe()
      .then((u) => setUserState(u))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setUser = useCallback((newUser: User) => {
    setUserState(newUser);
  }, []);

  const logout = useCallback(() => {
    api.auth.logout().catch(() => {});
    setUserState(null);
  }, []);

  // Don't render children until we know whether a session exists
  if (!ready) return null;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
