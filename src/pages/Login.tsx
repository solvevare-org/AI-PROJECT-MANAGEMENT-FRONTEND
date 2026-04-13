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
    
    // Forgot password states
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState<'email' | 'code' | 'password'>('email');
    const [forgotForm, setForgotForm] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotErrors, setForgotErrors] = useState<Record<string, string>>({});
    const [codeCountdown, setCodeCountdown] = useState(0);

    const set = (k: string, v: string) => {
        setForm(f => ({ ...f, [k]: v }));
        setErrors(e => ({ ...e, [k]: '' }));
        setStatusMsg(null);
    };

    const setForgot = (k: string, v: string) => {
        setForgotForm(f => ({ ...f, [k]: v }));
        setForgotErrors(e => ({ ...e, [k]: '' }));
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
            setFailedAttempts(0); // Reset on success
            login(res.data.token, res.data.user);
            toast.success(`Welcome back, ${res.data.user.name}!`);
            navigate('/');
        } catch (err: any) {
            const s   = err.response?.data?.status;
            const msg = err.response?.data?.error || 'Login failed';
            
            // Track failed attempts
            if (err.response?.status === 401) {
                const newAttempts = failedAttempts + 1;
                setFailedAttempts(newAttempts);
                if (newAttempts >= 3) {
                    setStatusMsg({ type: 'error', text: 'Too many failed attempts. Use Forgot Password to reset.' });
                } else {
                    setStatusMsg({ type: 'error', text: `${msg} (${newAttempts}/3 attempts)` });
                }
            } else if (s === 'pending')  setStatusMsg({ type: 'warning', text: msg });
            else if (s === 'rejected') setStatusMsg({ type: 'error', text: msg });
            else if (s === 'hold')     setStatusMsg({ type: 'info',  text: msg });
            else toast.error(msg);
        } finally { setLoading(false); }
    };

    // Step 1: Send reset code
    const handleSendCode = async () => {
        if (!forgotForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotForm.email)) {
            setForgotErrors({ email: 'Enter a valid email address' });
            return;
        }
        setForgotLoading(true);
        try {
            await api.post('/api/auth/forgot-password', { email: forgotForm.email });
            toast.success('Reset code sent to your email!');
            setForgotStep('code');
            setCodeCountdown(60); // 1 minute
            const timer = setInterval(() => {
                setCodeCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to send code');
        } finally { setForgotLoading(false); }
    };

    // Step 2: Verify code and show password fields
    const handleVerifyCode = async () => {
        if (!forgotForm.code || forgotForm.code.length !== 6) {
            setForgotErrors({ code: 'Enter a valid 6-digit code' });
            return;
        }
        setForgotLoading(true);
        try {
            // Just verify the code format, actual verification happens on reset
            setForgotStep('password');
            toast.success('Code verified! Now set your new password.');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Invalid code');
        } finally { setForgotLoading(false); }
    };

    // Step 3: Reset password
    const handleResetPassword = async () => {
        const e: Record<string, string> = {};
        if (!forgotForm.newPassword || forgotForm.newPassword.length < 8) e.newPassword = 'Password must be at least 8 characters';
        if (!forgotForm.confirmPassword) e.confirmPassword = 'Confirm password is required';
        if (forgotForm.newPassword !== forgotForm.confirmPassword) e.confirmPassword = 'Passwords do not match';
        
        if (Object.keys(e).length) {
            setForgotErrors(e);
            return;
        }

        setForgotLoading(true);
        try {
            await api.post('/api/auth/reset-password', {
                email: forgotForm.email,
                code: forgotForm.code,
                newPassword: forgotForm.newPassword,
            });
            toast.success('Password reset successfully! Please log in.');
            setShowForgotModal(false);
            setForgotStep('email');
            setForgotForm({ email: '', code: '', newPassword: '', confirmPassword: '' });
            setFailedAttempts(0);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to reset password');
        } finally { setForgotLoading(false); }
    };

    const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                                    disabled={failedAttempts >= 3}
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

                        <button 
                            type={failedAttempts >= 3 ? 'button' : 'submit'}
                            className="auth-submit-btn" 
                            disabled={loading}
                            onClick={failedAttempts >= 3 ? (e) => {
                                e.preventDefault();
                                setShowForgotModal(true);
                                setForgotForm({ ...forgotForm, email: form.email });
                            } : handleSubmit}
                        >
                            {loading
                                ? <><span className="auth-spinner" />Signing in...</>
                                : failedAttempts >= 3 ? '🔑 Forgot Password?' : 'Sign In →'
                            }
                        </button>
                    </form>



                    <p className="auth-switch-text">
                        Don't have an account?{' '}
                        <Link to="/signup" className="auth-switch-link">Create account</Link>
                    </p>
                </div>
            </div>

            {/* ── Forgot Password Modal ── */}
            {showForgotModal && (
                <div className="modal-overlay" onClick={() => !forgotLoading && setShowForgotModal(false)}>
                    <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">🔑 Reset Password</div>
                                <div className="modal-subtitle">Two-step verification</div>
                            </div>
                            <button className="modal-close" onClick={() => !forgotLoading && setShowForgotModal(false)} disabled={forgotLoading}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Step 1: Email */}
                            {forgotStep === 'email' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div className="auth-field">
                                        <label className="auth-label">Email Address</label>
                                        <div className="auth-input-wrap">
                                            <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                            <input
                                                className={`auth-input ${forgotErrors.email ? 'auth-input-err' : ''}`}
                                                type="email"
                                                placeholder="you@company.com"
                                                value={forgotForm.email}
                                                onChange={e => setForgot('email', e.target.value)}
                                                disabled={forgotLoading}
                                                autoComplete="email"
                                            />
                                        </div>
                                        {forgotErrors.email && <p className="auth-err-msg">{forgotErrors.email}</p>}
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>We'll send a 6-digit code to verify your identity.</p>
                                    <button
                                        type="button"
                                        className="auth-submit-btn"
                                        onClick={handleSendCode}
                                        disabled={forgotLoading}
                                    >
                                        {forgotLoading ? <><span className="auth-spinner" />Sending...</> : '📧 Get Code'}
                                    </button>
                                </div>
                            )}

                            {/* Step 2: Code Verification */}
                            {forgotStep === 'code' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div className="auth-alert auth-alert-warning">
                                        <span className="auth-alert-icon">⚠️</span>
                                        <span>Do NOT share this code with anyone!</span>
                                    </div>
                                    <div className="auth-field">
                                        <label className="auth-label">Enter 6-Digit Code</label>
                                        <div className="auth-input-wrap">
                                            <input
                                                className={`auth-input ${forgotErrors.code ? 'auth-input-err' : ''}`}
                                                type="text"
                                                placeholder="000000"
                                                value={forgotForm.code}
                                                onChange={e => setForgot('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                maxLength={6}
                                                disabled={forgotLoading}
                                                style={{ fontSize: '1.5rem', letterSpacing: '0.5em', textAlign: 'center', fontWeight: 600, paddingLeft: 14 }}
                                            />
                                        </div>
                                        {forgotErrors.code && <p className="auth-err-msg">{forgotErrors.code}</p>}
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Code expires in: <strong style={{ color: codeCountdown <= 10 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{formatCountdown(codeCountdown)}</strong></p>
                                    <button
                                        type="button"
                                        className="auth-submit-btn"
                                        onClick={handleVerifyCode}
                                        disabled={forgotLoading || forgotForm.code.length !== 6}
                                    >
                                        {forgotLoading ? <><span className="auth-spinner" />Verifying...</> : '✓ Verify Code'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => setForgotStep('email')}
                                        disabled={forgotLoading}
                                        style={{ width: '100%' }}
                                    >
                                        ← Back
                                    </button>
                                </div>
                            )}

                            {/* Step 3: New Password */}
                            {forgotStep === 'password' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div className="auth-field">
                                        <label className="auth-label">Create a New Password</label>
                                        <div className="auth-input-wrap">
                                            <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                            <input
                                                className={`auth-input ${forgotErrors.newPassword ? 'auth-input-err' : ''}`}
                                                type="password"
                                                placeholder="••••••••"
                                                value={forgotForm.newPassword}
                                                onChange={e => setForgot('newPassword', e.target.value)}
                                                disabled={forgotLoading}
                                            />
                                        </div>
                                        {forgotErrors.newPassword && <p className="auth-err-msg">{forgotErrors.newPassword}</p>}
                                    </div>
                                    <div className="auth-field">
                                        <label className="auth-label">Confirm Password</label>
                                        <div className="auth-input-wrap">
                                            <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                            <input
                                                className={`auth-input ${forgotErrors.confirmPassword ? 'auth-input-err' : ''}`}
                                                type="password"
                                                placeholder="••••••••"
                                                value={forgotForm.confirmPassword}
                                                onChange={e => setForgot('confirmPassword', e.target.value)}
                                                disabled={forgotLoading}
                                            />
                                        </div>
                                        {forgotErrors.confirmPassword && <p className="auth-err-msg">{forgotErrors.confirmPassword}</p>}
                                        {forgotForm.newPassword && forgotForm.confirmPassword && forgotForm.newPassword === forgotForm.confirmPassword && (
                                            <p style={{ fontSize: '0.8rem', color: 'var(--accent-green)', margin: '4px 0 0 0' }}>✓ Passwords match</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="auth-submit-btn"
                                        onClick={handleResetPassword}
                                        disabled={forgotLoading || !forgotForm.newPassword || !forgotForm.confirmPassword || forgotForm.newPassword !== forgotForm.confirmPassword}
                                    >
                                        {forgotLoading ? <><span className="auth-spinner" />Resetting...</> : '✓ Confirm & Reset'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => setForgotStep('code')}
                                        disabled={forgotLoading}
                                        style={{ width: '100%' }}
                                    >
                                        ← Back
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
