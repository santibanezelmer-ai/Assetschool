import React, { createContext, useContext, useState, useEffect } from 'react';
import { SystemRole } from '@assetschool/shared-types';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SystemRole;
  institutionId: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  login: async () => false,
  logout: () => {},
  error: null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('assetschool_token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('assetschool_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [error, setError] = useState<string | null>(null);

  // Auto-login with default teacher profile if unauthenticated for smooth demo/testing
  useEffect(() => {
    if (!token) {
      const defaultTeacher: AuthUser = {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        email: 'profesor@assetschool.lan',
        firstName: 'Mariana',
        lastName: 'Fuentes',
        role: SystemRole.TEACHER,
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      };
      setUser(defaultTeacher);
      setToken('demo_token_phase1');
    }
  }, [token]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Credenciales inválidas');
      }

      const data = await res.json();
      setToken(data.accessToken);
      setUser(data.user);
      localStorage.setItem('assetschool_token', data.accessToken);
      localStorage.setItem('assetschool_user', JSON.stringify(data.user));
      return true;
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor');
      return false;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('assetschool_token');
    localStorage.removeItem('assetschool_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user),
        login,
        logout,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
