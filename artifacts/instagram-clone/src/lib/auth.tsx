import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { useGetMe, setAuthTokenGetter, setOnUnauthorized } from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, refreshToken: string, user: UserProfile) => void;
  logout: () => void;
  updateUser: (user: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "pixlr_token";
const REFRESH_KEY = "pixlr_refresh_token";

// Keep a module-level ref to the latest token so the getter always returns
// the most recent value without needing React state.
let _latestToken: string | null = localStorage.getItem(TOKEN_KEY);

setAuthTokenGetter(() => _latestToken);

async function attemptRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Refresh failed — clear stored tokens
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      _latestToken = null;
      return null;
    }
    const data = (await res.json()) as { token: string; refreshToken: string };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    _latestToken = data.token;
    return data.token;
  } catch {
    return null;
  }
}

setOnUnauthorized(attemptRefresh);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const loggingOut = useRef(false);

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!token, retry: false } as any,
  });

  useEffect(() => {
    if (error && !loggingOut.current) {
      logout();
    }
  }, [error]);

  const login = (newToken: string, newRefreshToken: string, newUser: UserProfile) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(REFRESH_KEY, newRefreshToken);
    _latestToken = newToken;
    setToken(newToken);
    queryClient.setQueryData(["/api/auth/me"], newUser);
    setLocation(newUser.profileCompleted ? "/" : "/setup-profile");
  };

  const logout = () => {
    loggingOut.current = true;
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    // Fire-and-forget revocation — don't block the UI
    if (refreshToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    _latestToken = null;
    setToken(null);
    queryClient.clear();
    setLocation("/login");
    setTimeout(() => { loggingOut.current = false; }, 500);
  };

  const updateUser = (newUser: UserProfile) => {
    queryClient.setQueryData(["/api/auth/me"], newUser);
  };

  const isLoading = isUserLoading && !!token;

  return (
    <AuthContext.Provider value={{ user: user ?? null, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
