import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';

const ALL_TECHS = [
    'React', 'Next.js', 'Vue', 'Angular', 'HTML', 'CSS', 'Tailwind',
    'Node.js', 'Express', 'Django', 'Laravel', 'Spring Boot',
    'MongoDB', 'MySQL', 'PostgreSQL', 'SQL Server',
    'TypeScript', 'JavaScript', 'Python', 'PHP', 'Java', 'C#',
    'Docker', 'AWS', 'Git', 'Redux', 'GraphQL', 'REST API',
];

interface TechItem { name: string; rating: number; }

export default function Signup() {
    const navigate   = useNavigate();
    const avatarRef  = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({ name: '', email: '', password: '', gender: '', role: '' });
    const [avatarFile, setAvatarFile]       = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState('');
    const [errors, setErrors]               = useState<Record<string, string>>({});
    const [loading, setLoading]             = useState(false);
    const [showPass, setShowPass]           = useState(false);
    const [showTechModal, setShowTechModal] = useState(false);
    const [techSearch, setTechSearch]       = useState('');
    const [selectedTechs, setSelectedTechs] = useState<TechItem[]>([]);

    const set = (k: string, v: string) => {
        setForm(f => ({ ...f, [k]: v }));
        setErrors(e => ({ ...e, [k]: '' }));
    };

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.name || form.name.trim().length < 4) e.name = 'Minimum 4 characters required';
        if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
        if (!form.password || form.password.length < 8) e.password = 'Minimum 8 characters required';
        if (!form.gender) e.gender = 'Please select your gender';
        if (!form.role)   e.role   = 'Please select your role';
        if (form.role === 'developer' && !selectedTechs.length) e.tech = 'Add at least one technology';
        setErrors(e);
        return !Object.keys(e).length;
    };

    const handleAvatar = (file: File) => {
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const addTech    = (name: string) => { if (!selectedTechs.find(t => t.name === name)) setSelectedTechs(p => [...p, { name, rating: 3 }]); };
    const removeTech = (name: string) => setSelectedTechs(p => p.filter(t => t.name !== name));
    const setRating  = (name: string, rating: number) => setSelectedTechs(p => p.map(t => t.name === name ? { ...t, rating } : t));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            const fd = new FormData();
            fd.append('name', form.name.trim());
            fd.append('email', form.email.toLowerCase());
            fd.append('password', form.password);
            fd.append('gender', form.gender);
            fd.append('role', form.role);
            if (avatarFile) fd.append('avatar', avatarFile);
            if (form.role === 'developer') fd.append('techStack', JSON.stringify(selectedTechs));
            const res = await api.post('/api/auth/signup', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success(res.data.message);
            navigate('/login');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Signup failed');
        } finally { setLoading(false); }
    };

    const filteredTechs = ALL_TECHS.filter(t =>
        t.toLowerCase().includes(techSearch.toLowerCase()) && !selectedTechs.find(s => s.name === t)
    );

    return (
        <div className="auth-layout">
            {/* ── Left Panel ── */}
            <div className="auth-left-panel">
                <div className="auth-panel-content">
                    <div className="auth-panel-logo">
                        <div className="auth-logo-box">S</div>
                        <span className="auth-logo-text">SolvePM</span>
                    </div>
                    <h1 className="auth-panel-heading">Join the team.<br />Build smarter.</h1>
                    <p className="auth-panel-sub">Create your profile, select your tech stack, and let AI match you with the right tasks automatically.</p>
                    <div className="auth-panel-features">
                        {['Profile-based task matching', 'Skill score tracking', 'Admin approval workflow', 'Real-time notifications'].map(f => (
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
                <div className="auth-form-wrap auth-form-wrap-lg">
                    <div className="auth-form-header">
                        <h2 className="auth-form-title">Create your account</h2>
                        <p className="auth-form-sub">Fill in your details to get started</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form-body">

                        {/* Avatar */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                            <div className="auth-avatar-wrap" onClick={() => avatarRef.current?.click()}>
                                {avatarPreview
                                    ? <img src={avatarPreview} alt="avatar" className="auth-avatar-img" />
                                    : <div className="auth-avatar-placeholder">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                        <span>Photo</span>
                                      </div>
                                }
                                <div className="auth-avatar-overlay">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                </div>
                                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }}
                                    onChange={e => e.target.files?.[0] && handleAvatar(e.target.files[0])} />
                            </div>
                        </div>

                        {/* Name + Email */}
                        <div className="auth-grid-2">
                            <div className="auth-field">
                                <label className="auth-label">Full Name *</label>
                                <div className="auth-input-wrap">
                                    <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <input className={`auth-input ${errors.name ? 'auth-input-err' : ''}`}
                                        placeholder="Min 4 characters" value={form.name}
                                        onChange={e => set('name', e.target.value)} />
                                </div>
                                {errors.name && <p className="auth-err-msg">{errors.name}</p>}
                            </div>
                            <div className="auth-field">
                                <label className="auth-label">Email Address *</label>
                                <div className="auth-input-wrap">
                                    <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    <input className={`auth-input ${errors.email ? 'auth-input-err' : ''}`}
                                        type="email" placeholder="you@company.com" value={form.email}
                                        onChange={e => set('email', e.target.value)} />
                                </div>
                                {errors.email && <p className="auth-err-msg">{errors.email}</p>}
                            </div>
                        </div>

                        {/* Password */}
                        <div className="auth-field">
                            <label className="auth-label">Password *</label>
                            <div className="auth-input-wrap">
                                <svg className="auth-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                <input className={`auth-input ${errors.password ? 'auth-input-err' : ''}`}
                                    type={showPass ? 'text' : 'password'} placeholder="Min 8 characters"
                                    value={form.password} onChange={e => set('password', e.target.value)} />
                                <button type="button" className="auth-eye-btn" onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                                    {showPass
                                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    }
                                </button>
                            </div>
                            {errors.password && <p className="auth-err-msg">{errors.password}</p>}
                        </div>

                        {/* Gender + Role */}
                        <div className="auth-grid-2">
                            <div className="auth-field">
                                <label className="auth-label">Gender *</label>
                                <select className={`auth-select ${errors.gender ? 'auth-input-err' : ''}`}
                                    value={form.gender} onChange={e => set('gender', e.target.value)}>
                                    <option value="">Select gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                                {errors.gender && <p className="auth-err-msg">{errors.gender}</p>}
                            </div>
                            <div className="auth-field">
                                <label className="auth-label">Role *</label>
                                <select className={`auth-select ${errors.role ? 'auth-input-err' : ''}`}
                                    value={form.role}
                                    onChange={e => { set('role', e.target.value); setSelectedTechs([]); setErrors(x => ({ ...x, tech: '' })); }}>
                                    <option value="">Select role</option>
                                    <option value="developer">Developer</option>
                                    <option value="sales">Sales</option>
                                    <option value="graphic-designer">Graphic Designer</option>
                                    <option value="admin">Admin</option>
                                </select>
                                {errors.role && <p className="auth-err-msg">{errors.role}</p>}
                            </div>
                        </div>

                        {/* Tech Stack — developer only */}
                        {form.role === 'developer' && (
                            <div className="auth-field">
                                <label className="auth-label">Tech Stack *</label>
                                <button type="button" className="auth-tech-btn" onClick={() => setShowTechModal(true)}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                                    {selectedTechs.length ? `${selectedTechs.length} technologies selected — Edit` : 'Select your technologies'}
                                </button>
                                {errors.tech && <p className="auth-err-msg">{errors.tech}</p>}
                                {selectedTechs.length > 0 && (
                                    <div className="auth-tech-tags">
                                        {selectedTechs.map(t => (
                                            <span key={t.name} className="auth-tech-tag">
                                                {t.name}
                                                <span className="auth-tech-stars">{'★'.repeat(t.rating)}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Role info banner */}
                        {form.role === 'developer' && (
                            <div className="auth-info-banner">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                Developer accounts require admin approval before login access is granted.
                            </div>
                        )}

                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                            {loading
                                ? <><span className="auth-spinner" />Creating account...</>
                                : form.role === 'developer' ? 'Send for Admin Approval →' : 'Create Account →'
                            }
                        </button>
                    </form>

                    <p className="auth-switch-text">
                        Already have an account?{' '}
                        <Link to="/login" className="auth-switch-link">Sign in</Link>
                    </p>
                </div>
            </div>

            {/* ── Tech Stack Modal ── */}
            {showTechModal && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTechModal(false); }}>
                    <div className="modal" style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Select Tech Stack</div>
                                <div className="modal-subtitle">Search, add, and rate your skills</div>
                            </div>
                            <button className="modal-close" onClick={() => setShowTechModal(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Search */}
                            <div style={{ position: 'relative' }}>
                                <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }}
                                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <input className="form-input" style={{ paddingLeft: 34, paddingRight: 34 }}
                                    placeholder="Search technologies..." value={techSearch}
                                    onChange={e => setTechSearch(e.target.value)} />
                                {techSearch && (
                                    <button type="button" onClick={() => setTechSearch('')}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
                                )}
                            </div>

                            {/* Tech list */}
                            <div className="tech-list">
                                {filteredTechs.map(t => (
                                    <div key={t} className="tech-list-item" onClick={() => addTech(t)}>
                                        <span className="tech-list-name">{t}</span>
                                        <span className="tech-list-add">+ Add</span>
                                    </div>
                                ))}
                                {!filteredTechs.length && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.855rem' }}>
                                        No technologies found
                                    </div>
                                )}
                            </div>

                            {/* Selected with ratings */}
                            {selectedTechs.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                        Selected ({selectedTechs.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        {selectedTechs.map(t => (
                                            <div key={t.name} className="tech-selected-item">
                                                <span className="tech-selected-name">{t.name}</span>
                                                <div className="star-rating">
                                                    {[1,2,3,4,5].map(s => (
                                                        <button key={s} type="button"
                                                            className={`star-btn ${s <= t.rating ? 'star-active' : ''}`}
                                                            onClick={() => setRating(t.name, s)}>★</button>
                                                    ))}
                                                </div>
                                                <button type="button" className="tech-remove-btn" onClick={() => removeTech(t.name)}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="modal-footer">
                                <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowTechModal(false)}>
                                    Done — {selectedTechs.length} tech{selectedTechs.length !== 1 ? 's' : ''} selected
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
