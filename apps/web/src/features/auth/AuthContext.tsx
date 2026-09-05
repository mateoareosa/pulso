import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CurrentUserResponse, LoginInput, RegisterInput } from '@pulso/contracts';
import { apiClient, ApiError, NetworkError } from '../../services/api-client';
import { useCatalogStore } from '../catalog/store/catalog.store';
import { offlineDb } from '../sync/offline-db';

export type AuthStatus = 'INITIAL_CHECK' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'NETWORK_ERROR';

export interface AuthContextType {
  status: AuthStatus;
  session: CurrentUserResponse | null;
  errorMessage: string | null;
  login: (credentials: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('INITIAL_CHECK');
  const [session, setSession] = useState<CurrentUserResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    setStatus('INITIAL_CHECK');
    setErrorMessage(null);
    try {
      const data = await apiClient.getCurrentSession();
      setSession(data);
      setStatus('AUTHENTICATED');
    } catch (err) {
      if (err instanceof NetworkError) {
        setStatus('NETWORK_ERROR');
        setErrorMessage('No se pudo conectar con el servidor. Verifique que la API esté activa.');
      } else if (err instanceof ApiError && err.status === 401) {
        setSession(null);
        setStatus('UNAUTHENTICATED');
      } else {
        setSession(null);
        setStatus('UNAUTHENTICATED');
      }
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (credentials: LoginInput) => {
    setErrorMessage(null);
    const data = await apiClient.login(credentials);
    setSession(data);
    setStatus('AUTHENTICATED');
  };

  const register = async (input: RegisterInput) => {
    setErrorMessage(null);
    const data = await apiClient.register(input);
    setSession(data);
    setStatus('AUTHENTICATED');
  };

  const logout = async () => {
    useCatalogStore.getState().clearCatalog();
    const clearDbPromise = offlineDb.clearCachedCatalog().catch(() => {});

    try {
      await apiClient.logout();
    } finally {
      await clearDbPromise;
      setSession(null);
      setStatus('UNAUTHENTICATED');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        errorMessage,
        login,
        register,
        logout,
        retryBootstrap: checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useOptionalAuth(): AuthContextType | null {
  return useContext(AuthContext);
}
