import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ThemeCtx { dark: boolean; toggle: () => void; }

const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [dark, setDark] = useState(() => localStorage.getItem('solvepm_theme') === 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        localStorage.setItem('solvepm_theme', dark ? 'dark' : 'light');
    }, [dark]);

    return (
        <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
