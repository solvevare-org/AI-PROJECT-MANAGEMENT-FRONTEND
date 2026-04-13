import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// Overall rating = average of all tech ratings, supports .5 precision
const calcOverallRating = (techStack: { name: string; rating: number }[]): number => {
    if (!techStack?.length) return 0;
    const avg = techStack.reduce((s, t) => s + t.rating, 0) / techStack.length;
    return Math.round(avg * 2) / 2;
};

const fmtHours = (h: number): string => {
    if (!h || h <= 0) return '0 mins';
    if (h < 1) return `${Math.round(h * 60)} mins`;
    return `${h}h`;
};

// Half-star display component
const StarDisplay = ({ rating, max = 5 }: { rating: number; max?: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {Array.from({ length: max }, (_, i) => {
            const full = i + 1 <= rating;
            const half = !full && rating > i && rating < i + 1;
            return (
                <span key={i} style={{ position: 'relative', fontSize: '0.82rem', lineHeight: 1 }}>
                    <span style={{ color: '#e5e7eb' }}>★</span>
                    {(full || half) && (
                        <span style={{
                            position: 'absolute', left: 0, top: 0, color: '#f59e0b',
                            width: full ? '100%' : '50%', overflow: 'hidden', display: 'inline-block',
                        }}>★</span>
                    )}
                </span>
            );
        })}
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', marginLeft: 2 }}>{rating.toFixed(1)}</span>
    </div>
);

interface AuthUser {
    _id: string;
    name: string;
    email: string;
    gender: string;
    role: string;
    avatar: string;
    status: string;
    techStack: { name: string; rating: number }[];
    scoreMap: Record<string, number>;  // live scores updated after task completion
    totalTasksCompleted: number;
    createdAt: string;
}

interface LegacyUser {
    _id: string;
    name: string;
    email: string;
    role: string;
    skills: string[];
    scoreMap: Record<string, number>;
    totalTasksCompleted: number;
    currentTask: { title: string } | null;
}

const ROLE_COLORS: Record<string, string> = {
    developer:        '#2563eb',
    admin:            '#7c3aed',
    sales:            '#059669',
    'graphic-designer': '#d97706',
    manager:          '#0891b2',
    qa:               '#dc2626',
    devops:           '#374151',
};

const ROLE_BG: Record<string, string> = {
    developer:        '#eff6ff',
    admin:            '#f5f3ff',
    sales:            '#f0fdf4',
    'graphic-designer': '#fffbeb',
    manager:          '#ecfeff',
    qa:               '#fef2f2',
    devops:           '#f9fafb',
};

export default function Developers() {
    const { user: currentUser, isAdmin } = useAuth();
    const [authUsers, setAuthUsers]     = useState<AuthUser[]>([]);
    const [legacyUsers, setLegacyUsers] = useState<LegacyUser[]>([]);
    const [myTasks, setMyTasks]         = useState<any[]>([]);
    const [loading, setLoading]         = useState(true);
    const [tab, setTab]                 = useState<'all' | 'legacy'>('all');
    const [taskFilter, setTaskFilter]   = useState<'all' | 'assigned' | 'in-progress' | 'done'>('all');
    const [search, setSearch]           = useState('');
    const [filterRole, setFilterRole]   = useState('all');

    const fetchAll = useCallback(async () => {
        try {
            const calls: Promise<any>[] = [
                api.get('/api/auth/developers?status=approved'),
                api.get('/api/users'),
            ];
            // Developers also fetch their own tasks
            if (!isAdmin && currentUser?._id) {
                calls.push(api.get(`/api/tasks?assignedTo=${currentUser._id}`));
            }
            const results = await Promise.allSettled(calls);

            if (results[0].status === 'fulfilled') setAuthUsers(results[0].value.data);
            if (results[1].status === 'fulfilled') setLegacyUsers(results[1].value.data);
            if (results[2] && results[2].status === 'fulfilled') setMyTasks(results[2].value.data);
        } catch {
            toast.error('Failed to load team members');
        } finally {
            setLoading(false);
        }
    }, [isAdmin, currentUser?._id]);

    // Initial fetch
    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Real-time polling every 10 seconds
    useEffect(() => {
        const interval = setInterval(fetchAll, 10000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const handleDeleteLegacy = async (id: string, name: string) => {
        if (!confirm(`Remove ${name} from team?`)) return;
        try {
            await api.delete(`/api/users/${id}`);
            toast.success(`${name} removed`);
            fetchAll();
        } catch {
            toast.error('Remove failed');
        }
    };

    const filteredAuth = authUsers.filter(u => {
        const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
                            u.email.toLowerCase().includes(search.toLowerCase());
        const matchRole   = filterRole === 'all' || u.role === filterRole;
        return matchSearch && matchRole;
    });

    const filteredLegacy = legacyUsers.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    const totalCount = authUsers.length + legacyUsers.length;

    if (loading) return <div className="loading-text">Loading team members...</div>;

    // ── Computed task stats for developer view ──
    const taskCounts = {
        all:         myTasks.length,
        assigned:    myTasks.filter(t => t.status === 'assigned').length,
        'in-progress': myTasks.filter(t => t.status === 'in-progress').length,
        done:        myTasks.filter(t => t.status === 'done').length,
    };
    const filteredMyTasks = taskFilter === 'all' ? myTasks : myTasks.filter(t => t.status === taskFilter);

    const TASK_TABS: { key: typeof taskFilter; label: string; color: string }[] = [
        { key: 'all',          label: `My Tasks (${taskCounts.all})`,           color: '#2563eb' },
        { key: 'assigned',     label: `Pending (${taskCounts.assigned})`,        color: '#6b7280' },
        { key: 'in-progress',  label: `In Progress (${taskCounts['in-progress']})`, color: '#d97706' },
        { key: 'done',         label: `Completed (${taskCounts.done})`,          color: '#059669' },
    ];

    const STATUS_CLS: Record<string, string> = {
        pending: 'badge-pending', assigned: 'badge-assigned',
        'in-progress': 'badge-in-progress', done: 'badge-done',
    };
    const PRIORITY_CLS: Record<string, string> = {
        low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title">Team</h1>
                    <p className="page-subtitle">
                        {totalCount} members · updates every 10s
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#059669', marginLeft: 8, verticalAlign: 'middle', animation: 'pulse 2s infinite' }} />
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }}
                            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input className="form-input" style={{ paddingLeft: 32, width: 200 }}
                            placeholder="Search members..."
                            value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <select className="form-select" style={{ width: 140 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                        <option value="all">All Roles</option>
                        <option value="developer">Developer</option>
                        <option value="admin">Admin</option>
                        <option value="sales">Sales</option>
                        <option value="graphic-designer">Graphic Designer</option>
                    </select>
                    <button className="btn btn-outline btn-sm" onClick={fetchAll} title="Refresh">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                </div>
            </div>

            {/* ── Developer Task Panel (only for non-admin developers) ── */}
            {!isAdmin && (
                <div className="card" style={{ marginBottom: 24 }}>
                    {/* Filter tabs — same style as Proposals */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                        {TASK_TABS.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTaskFilter(t.key)}
                                style={{
                                    padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
                                    fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                                    border: `1px solid ${taskFilter === t.key ? t.color : 'var(--border)'}`,
                                    background: taskFilter === t.key ? t.color : 'transparent',
                                    color: taskFilter === t.key ? '#fff' : 'var(--text-secondary)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Stat summary row */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Total',       value: taskCounts.all,           color: '#2563eb' },
                            { label: 'Pending',     value: taskCounts.assigned,      color: '#6b7280' },
                            { label: 'In Progress', value: taskCounts['in-progress'], color: '#d97706' },
                            { label: 'Completed',   value: taskCounts.done,          color: '#059669' },
                        ].map(s => (
                            <div key={s.label} style={{
                                flex: 1, minWidth: 80, padding: '10px 14px', borderRadius: 10,
                                background: `${s.color}10`, border: `1px solid ${s.color}25`,
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Task list */}
                    {filteredMyTasks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: '0.855rem' }}>
                            {taskFilter === 'all' ? 'No tasks assigned yet' : `No ${taskFilter} tasks`}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {filteredMyTasks.map((t: any) => (
                                <div key={t._id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '10px 14px', borderRadius: 8,
                                    background: 'var(--bg-app)', border: '1px solid var(--border)',
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 3 }}>{t.title}</div>
                                        {t.project && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📁 {t.project.title}</div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <span className={`badge ${PRIORITY_CLS[t.priority] || ''}`}>{t.priority}</span>
                                        <span className={`badge ${STATUS_CLS[t.status] || ''}`}>{t.status}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{fmtHours(t.estimatedHours)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                {[
                    { key: 'all',    label: `Registered Users (${authUsers.length})` },
                    { key: 'legacy', label: `System Users (${legacyUsers.length})` },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key as any)}
                        style={{
                            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '0.855rem', fontWeight: 600, fontFamily: 'inherit',
                            color: tab === t.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                            borderBottom: tab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
                            marginBottom: -1,
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Registered Users (Auth) ── */}
            {tab === 'all' && (
                filteredAuth.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '56px 32px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.3 }}>👥</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No approved members found</div>
                        <div style={{ fontSize: '0.845rem', color: 'var(--text-muted)' }}>Approve developer proposals from the Proposals page</div>
                    </div>
                ) : (
                    <div className="dev-grid">
                        {filteredAuth.map(user => {
                            const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                            const roleColor = ROLE_COLORS[user.role] || '#6b7280';
                            const roleBg    = ROLE_BG[user.role]    || '#f3f4f6';

                            return (
                                <div className="dev-card" key={user._id}>
                                    {/* Top color strip */}
                                    <div style={{ height: 3, background: roleColor, borderRadius: '12px 12px 0 0' }} />

                                    <div style={{ padding: '18px 20px 20px' }}>
                                        {/* Avatar + Status */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                                            <div style={{ position: 'relative' }}>
                                                {user.avatar
                                                    ? <img src={`http://localhost:5000${user.avatar}`} alt={user.name}
                                                        style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                                                    : <div style={{
                                                        width: 52, height: 52, borderRadius: '50%',
                                                        background: `linear-gradient(135deg, ${roleColor}, ${roleColor}99)`,
                                                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '1rem', fontWeight: 700, border: '2px solid var(--border)',
                                                      }}>{initials}</div>
                                                }
                                                <div style={{
                                                    position: 'absolute', bottom: 1, right: 1,
                                                    width: 11, height: 11, borderRadius: '50%',
                                                    background: '#059669', border: '2px solid #fff',
                                                }} />
                                            </div>
                                            <span style={{
                                                padding: '3px 10px', borderRadius: 100,
                                                fontSize: '0.68rem', fontWeight: 700,
                                                background: roleBg, color: roleColor,
                                                border: `1px solid ${roleColor}30`,
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                            }}>
                                                {user.role.replace('-', ' ')}
                                            </span>
                                        </div>

                                        {/* Name + Email */}
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 3 }}>{user.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                            {user.email}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                            {user.gender.charAt(0).toUpperCase() + user.gender.slice(1)}
                                            <span style={{ margin: '0 4px' }}>·</span>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                            Joined {new Date(user.createdAt).toLocaleDateString()}
                                        </div>

                                        {/* Tech Stack — show live scoreMap if available, else techStack ratings */}
                                        {user.techStack?.length > 0 && (
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Skill Scores</div>
                                                    <StarDisplay rating={calcOverallRating(user.techStack)} />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', paddingRight: 2 }}>
                                                    {user.techStack.map(t => {
                                                        // Use live scoreMap score if exists, else convert star rating
                                                        const liveScore = user.scoreMap?.[t.name] ?? Math.round((t.rating / 5) * 100);
                                                        return (
                                                            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ width: 80, fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0 }}>{t.name}</span>
                                                                <div className="score-bar-container">
                                                                    <div className="score-bar" style={{ width: `${liveScore}%`, background: roleColor }} />
                                                                </div>
                                                                <span style={{
                                                                    fontSize: '0.72rem', fontWeight: 700, minWidth: 28, textAlign: 'right',
                                                                    color: liveScore >= 80 ? '#059669' : liveScore >= 60 ? '#2563eb' : '#d97706'
                                                                }}>{liveScore}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {user.totalTasksCompleted > 0 && (
                                                    <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ color: '#059669', fontWeight: 700 }}>✅ {user.totalTasksCompleted}</span> tasks completed
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* ── Legacy / System Users ── */}
            {tab === 'legacy' && (
                filteredLegacy.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '56px 32px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.3 }}>🤖</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No system users found</div>
                    </div>
                ) : (
                    <div className="dev-grid">
                        {filteredLegacy.map(user => {
                            const scores = Object.entries(user.scoreMap || {});
                            const roleColor = ROLE_COLORS[user.role] || '#6b7280';
                            const roleBg    = ROLE_BG[user.role]    || '#f3f4f6';
                            const initials  = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

                            return (
                                <div className="dev-card" key={user._id}>
                                    <div style={{ height: 3, background: roleColor, borderRadius: '12px 12px 0 0' }} />
                                    <div style={{ padding: '18px 20px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                                            <div style={{
                                                width: 52, height: 52, borderRadius: '50%',
                                                background: `linear-gradient(135deg, ${roleColor}, ${roleColor}99)`,
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '1rem', fontWeight: 700, border: '2px solid var(--border)',
                                            }}>{initials}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 100,
                                                    fontSize: '0.68rem', fontWeight: 700,
                                                    background: roleBg, color: roleColor,
                                                    border: `1px solid ${roleColor}30`,
                                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                                }}>{user.role}</span>
                                                <button className="btn btn-danger btn-xs" onClick={() => handleDeleteLegacy(user._id, user.name)}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                                                    Remove
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 3 }}>{user.name}</div>
                                        {user.email && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>{user.email}</div>}

                                        <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasks Done</div>
                                                <div style={{ fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>{user.totalTasksCompleted}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: user.currentTask ? '#d97706' : '#059669' }}>
                                                    {user.currentTask ? 'Busy' : 'Available'}
                                                </div>
                                            </div>
                                        </div>

                                        {user.skills.length > 0 && (
                                            <div className="skills-wrap" style={{ marginBottom: scores.length ? 12 : 0 }}>
                                                {user.skills.map(s => <span key={s} className="skill-tag">{s}</span>)}
                                            </div>
                                        )}

                                        {scores.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Skill Scores</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', paddingRight: 2 }}>
                                                    {scores.map(([skill, score]) => (
                                                        <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ width: 80, fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0 }}>{skill}</span>
                                                            <div className="score-bar-container">
                                                                <div className="score-bar" style={{ width: `${score}%` }} />
                                                            </div>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: 24, textAlign: 'right', color: score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : '#d97706' }}>{score}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* Pulse animation */}
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>
    );
}
