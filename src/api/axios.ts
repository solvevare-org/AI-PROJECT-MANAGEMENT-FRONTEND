import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL,
});

// ── JWT decode helper (no library needed) ────────────────────────────────────
// Reads the exp claim from the JWT payload without verifying signature.
const getTokenExpiry = (token: string): number | null => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
};

const isTokenExpired = (token: string): boolean => {
    const exp = getTokenExpiry(token);
    if (!exp) return true;
    // Add 10s buffer so we don't logout right at the boundary
    return Date.now() / 1000 > exp - 10;
};

// ── Debounce flag — prevent multiple simultaneous 401s from firing logout ────
// e.g. notification poll + dashboard poll both return 401 at the same time
let logoutScheduled = false;

const scheduleLogout = (reason: 'expired' | 'unauthorized') => {
    if (logoutScheduled) return; // already handling it
    logoutScheduled = true;

    // Clear credentials immediately so no more authenticated requests go out
    localStorage.removeItem('solvepm_token');
    localStorage.removeItem('solvepm_user');
    delete api.defaults.headers.common['Authorization'];

    if (window.location.pathname === '/login') {
        logoutScheduled = false;
        return;
    }

    if (reason === 'expired') {
        // Token expired — show warning then redirect after 3s
        toast.error('⏰ Your session has expired. Redirecting to login...', {
            duration: 3000,
            id: 'session-expired', // prevent duplicate toasts
        });
        setTimeout(() => {
            logoutScheduled = false;
            window.location.href = '/login';
        }, 3000);
    } else {
        // Unauthorized but token not expired — could be server-side revocation
        toast.error('🔒 Access denied. Please log in again.', {
            duration: 3000,
            id: 'unauthorized',
        });
        setTimeout(() => {
            logoutScheduled = false;
            window.location.href = '/login';
        }, 3000);
    }
};

// ── Request interceptor — attach token to every request ──────────────────────
api.interceptors.request.use(
    config => {
        const token = localStorage.getItem('solvepm_token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    err => Promise.reject(err)
);

// ── Response interceptor — handle 401 intelligently ──────────────────────────
api.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            const token = localStorage.getItem('solvepm_token');

            if (!token) {
                // No token at all — just redirect silently
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(err);
            }

            if (isTokenExpired(token)) {
                // Token is expired — warn user and redirect
                scheduleLogout('expired');
            } else {
                // Token exists and is not expired but server returned 401
                // This means server rejected it (revoked, role changed, etc.)
                // Only logout if it's NOT a background/polling call
                const url = err.config?.url || '';
                const isBackgroundCall =
                    url.includes('/notifications') ||
                    url.includes('/activity');

                if (!isBackgroundCall) {
                    scheduleLogout('unauthorized');
                }
                // Background polling 401s are silently ignored —
                // they will retry on next poll cycle
            }
        }

        return Promise.reject(err);
    }
);

export default api;
