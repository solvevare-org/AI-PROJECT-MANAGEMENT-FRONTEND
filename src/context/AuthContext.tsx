import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../api/axios';

interface AuthUser {
    _id: string; name: string; email: string;
    role: string; avatar: string; status: string;
}

interface AuthCtx {
    user: AuthUser | null;
    token: string | null;
    login: (token: string, user: AuthUser) => void;
    logout: () => void;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthCtx>({
    user: null, token: null,
    login: () => {}, logout: () => {}, isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser]   = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        const t = localStorage.getItem('solvepm_token');
        const u = localStorage.getItem('solvepm_user');
        if (t && u) {
            setToken(t);
            setUser(JSON.parse(u));
            api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
        }
    }, []);

    const login = (t: string, u: AuthUser) => {
        setToken(t); setUser(u);
        localStorage.setItem('solvepm_token', t);
        localStorage.setItem('solvepm_user', JSON.stringify(u));
        api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    };

    const logout = () => {
        setToken(null); setUser(null);
        localStorage.removeItem('solvepm_token');
        localStorage.removeItem('solvepm_user');
        delete api.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAdmin: user?.role === 'admin' }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
