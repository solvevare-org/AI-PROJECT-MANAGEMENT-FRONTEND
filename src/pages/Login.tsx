import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
    const { login }  = useAuth();
    const navigate   = useNavigate();
    const [form, setForm]           = useState({ email: '', password: '' });
    const [errors, setErrors]       = useState<Record<string, string>>({});
    const [loading, setLoading]     = useState(false);
    const [showPass, setShowPass]   = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: string; text: string } | null>(null);

    const set = (k: string, v: string) => {
        setForm(f => ({ ...f, [k]: v }));
        setErrors(e => ({ ...e, [k]: '' }));
        setStatusMsg(null);
    };

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
        if (!form.password) e.password = 'Password is required';
        setErrors(e);
        return !Object.keys(e).length;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusMsg(null);
        if (!validate()) return;
        setLoading(true);
        try {
            const res = await api.post('/api/auth/login', form);
            login(res.data.token, res.data.user);
            toast.success(`Welcome back, ${res.data.user.name}!`);
            navigate('/');
        } catch (err: any) {
            const s   = err.response?.data?.status;
            const msg = err.response?.data?.error || 'Login failed';
            if (s === 'pending')  setStatusMsg({ type: 'warning', text: msg });
            else if (s === 'rejected') setStatusMsg({ type: 'error', text: msg });
            else if (s === 'hold')     setStatusMsg({ type: 'info',  text: msg });
            else toast.error(msg);
        } finally { setLoading(false); }
    };

    return (
        <div className="auth-layout">
            {/* ── Left Panel ── */}
            <div className="auth-left-panel">
                <div className="auth-panel-content">
                    <div className="auth-panel-logo">
                        <div className="auth-logo-box">S</div>
                        <span className="auth-logo-text">SolvePM</span>
                    </div>
                    <h1 className="auth-panel-heading">Manage projects<br />smarter with AI</h1>
                    <p className="auth-panel-sub">AI-powered task assignment, smart timelines, and real-time team tracking — all in one place.</p>
                    <div className="auth-panel-features">
                        {['AI-generated task breakdown', 'Smart developer assignment', 'Real-time progress tracking', 'Continuous learning system'].map(f => (
                            <div key={f} className="auth-feature-item">
                                <div className="auth-feature-dot" />
                                <span>{f}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="auth-panel-footer">© 2024 SolvePM · Solvevare</div>
            </div>

            {/* ── Right Panel (Form) ── */}
            <div className="auth-right-panel">
                <div className="auth-form-wrap">
                    <div className="auth-form-header">
                        <h2 className="auth-form-title">Sign in to your account</h2>
                        <p className="auth-form-sub">Enter your credentials to continue</p>
                    </div>

                    {statusMsg && (
                        <div className={`auth-alert auth-alert-${statusMsg.type}`}>
                            <span className="auth-alert-icon">
                                {statusMsg.type === 'warning' ? '⏳' : statusMsg.type === 'error' ? '❌' : '⏸️'}
                            </span>
                            <span>{statusMsg.text}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="auth-form-body">
                        <div className="auth-field">
                            <label className="auth-label">Email address</label>
                            <div className="auth-input-wrap">
                                <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                <input
                                    className={`auth-input ${errors.email ? 'auth-input-err' : ''}`}
                                    type="email" placeholder="you@company.com"
                                    value={form.email} onChange={e => set('email', e.target.value)}
                                    autoComplete="email"
                                />
                            </div>
                            {errors.email && <p className="auth-err-msg">{errors.email}</p>}
                        </div>

                        <div className="auth-field">
                            <label className="auth-label">Password</label>
                            <div className="auth-input-wrap">
                                <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                <input
                                    className={`auth-input ${errors.password ? 'auth-input-err' : ''}`}
                                    type={showPass ? 'text' : 'password'} placeholder="••••••••"
                                    value={form.password} onChange={e => set('password', e.target.value)}
                                    autoComplete="current-password"
                                />
                                <button type="button" className="auth-eye-btn" onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                                    {showPass
                                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    }
                                </button>
                            </div>
                            {errors.password && <p className="auth-err-msg">{errors.password}</p>}
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                            {loading
                                ? <><span className="auth-spinner" />Signing in...</>
                                : 'Sign In →'
                            }
                        </button>
                    </form>

                    <p className="auth-switch-text">
                        Don't have an account?{' '}
                        <Link to="/signup" className="auth-switch-link">Create account</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
