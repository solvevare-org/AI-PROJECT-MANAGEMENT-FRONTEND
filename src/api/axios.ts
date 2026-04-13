import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL,
});

// Auto-logout on 401 (expired or invalid token)
api.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('solvepm_token');
            localStorage.removeItem('solvepm_user');
            delete api.defaults.headers.common['Authorization'];
            // Hard redirect to login — works outside React tree too
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

export default api;
