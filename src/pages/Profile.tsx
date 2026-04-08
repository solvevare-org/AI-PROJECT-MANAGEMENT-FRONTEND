import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface TechItem { name: string; rating: number; }

interface ProfileData {
    _id: string;
    name: string;
    email: string;
    gender: string;
    role: string;
    avatar: string;
    status: string;
    techStack: TechItem[];
    scoreMap: Record<string, number>;
    totalTasksCompleted: number;
    createdAt: string;
}

interface Task {
    _id: string;
    title: string;
    status: string;
    priority: string;
    estimatedHours: number;
    actualHours: number | null;
    project?: { title: string };
    endTime: string | null;
}

const PRIORITY_CLS: Record<string, string> = {
    low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
};
const STATUS_CLS: Record<string, string> = {
    pending: 'badge-pending', assigned: 'badge-assigned',
    'in-progress': 'badge-in-progress', done: 'badge-done',
};

const getPerformanceLabel = (est: number, actual: number | null) => {
    if (actual == null) return null;
    const ratio = actual / (est || 1);
    if (ratio <= 0.70) return { label: 'Exceptional ⚡', color: '#059669' };
    if (ratio <= 0.90) return { label: 'Great 🎯',       color: '#2563eb' };
    if (ratio <= 1.00) return { label: 'On Time ✅',     color: '#059669' };
    if (ratio <= 1.15) return { label: 'Acceptable 👍',  color: '#d97706' };
    if (ratio <= 1.40) return { label: 'Slow ⚠️',        color: '#d97706' };
    if (ratio <= 1.80) return { label: 'Very Slow 🐢',   color: '#dc2626' };
    return               { label: 'Struggling 🔴',       color: '#dc2626' };
};

export default function Profile() {
    const { user: authUser } = useAuth();
    const [profile, setProfile]   = useState<ProfileData | null>(null);
    const [tasks, setTasks]       = useState<Task[]>([]);
    const [loading, setLoading]   = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [meRes, taskRes] = await Promise.all([
                api.get('/api/auth/me'),
                api.get(`/api/tasks?assignedTo=${authUser?._id}`),
            ]);
            setProfile(meRes.data);
            setTasks(taskRes.data);
        } catch {
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    }, [authUser?._id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return <div className="loading-text">Loading profile...</div>;
    if (!profile) return <div className="loading-text">Profile not found.</div>;

    const scores = Object.entries(profile.scoreMap || {});
    const doneTasks = tasks.filter(t => t.status === 'done');
    const activeTasks = tasks.filter(t => t.status !== 'done');
    const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Overall score = average of all skill scores
    const avgScore = scores.length
        ? Math.round(scores.reduce((s, [, v]) => s + v, 0) / scores.length)
        : 0;

    const scoreColor = avgScore >= 80 ? '#059669' : avgScore >= 60 ? '#2563eb' : '#d97706';

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">My Profile</h1>
                <p className="page-subtitle">Your skill scores, performance history and task record</p>
            </div>

            <div className="profile-layout">

                {/* ── Left: Identity card ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ textAlign: 'center', padding: '28px 24px' }}>
                        {/* Avatar */}
                        {profile.avatar
                            ? <img src={`http://localhost:5000${profile.avatar}`} alt={profile.name}
                                style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)', margin: '0 auto 14px' }} />
                            : <div style={{
                                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 14px',
                                background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.5rem', fontWeight: 800,
                              }}>{initials}</div>
                        }

                        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{profile.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>{profile.email}</div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                            <span className="badge badge-assigned" style={{ textTransform: 'capitalize' }}>{profile.role.replace('-', ' ')}</span>
                            <span className="badge badge-done">{profile.status}</span>
                        </div>

                        {/* Overall score ring */}
                        <div style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: '14px 24px', borderRadius: 12,
                            background: `${scoreColor}10`, border: `1px solid ${scoreColor}30`,
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{avgScore}</div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>Avg Score</div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#059669' }}>{profile.totalTasksCompleted}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#2563eb' }}>{activeTasks.length}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-secondary)' }}>{scores.length}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Skills</div>
                            </div>
                        </div>
                    </div>

                    {/* ── Skill Scores ── */}
                    {scores.length > 0 && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Skill Scores</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Updated after each task</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {scores.sort(([, a], [, b]) => b - a).map(([skill, score]) => (
                                    <div key={skill}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{skill}</span>
                                            <span style={{
                                                fontSize: '0.75rem', fontWeight: 700,
                                                color: score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : '#d97706',
                                            }}>{score}</span>
                                        </div>
                                        <div className="score-bar-container" style={{ height: 7 }}>
                                            <div className="score-bar" style={{
                                                width: `${score}%`,
                                                background: score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : '#d97706',
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Tech Stack (initial ratings) ── */}
                    {profile.techStack?.length > 0 && scores.length === 0 && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">Tech Stack</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Self-rated at signup</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {profile.techStack.map(t => (
                                    <div key={t.name} style={{
                                        padding: '5px 12px', borderRadius: 100,
                                        background: '#f5f3ff', border: '1px solid #ddd6fe',
                                        fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                    }}>
                                        {t.name}
                                        <span style={{ color: '#f59e0b', fontSize: '0.65rem' }}>{'★'.repeat(t.rating)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right: Task history ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Active tasks */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Active Tasks</span>
                            <span className="badge badge-assigned">{activeTasks.length}</span>
                        </div>
                        {activeTasks.length === 0 ? (
                            <div className="empty-state" style={{ padding: '20px 0' }}>
                                <div className="empty-icon">✅</div>
                                <div style={{ fontSize: '0.82rem' }}>No active tasks</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {activeTasks.map(t => (
                                    <div key={t._id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 8,
                                        background: 'var(--bg-app)', border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 3 }}>{t.title}</div>
                                            {t.project && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📁 {t.project.title}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <span className={`badge ${PRIORITY_CLS[t.priority]}`}>{t.priority}</span>
                                            <span className={`badge ${STATUS_CLS[t.status]}`}>{t.status}</span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.estimatedHours}h est.</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Completed task history */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Completed Tasks</span>
                            <span className="badge badge-done">{doneTasks.length}</span>
                        </div>
                        {doneTasks.length === 0 ? (
                            <div className="empty-state" style={{ padding: '20px 0' }}>
                                <div className="empty-icon">📋</div>
                                <div style={{ fontSize: '0.82rem' }}>No completed tasks yet</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
                                {doneTasks.map(t => {
                                    const perf = getPerformanceLabel(t.estimatedHours, t.actualHours);
                                    return (
                                        <div key={t._id} style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '10px 14px', borderRadius: 8,
                                            background: 'var(--bg-app)', border: '1px solid var(--border)',
                                        }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 3 }}>{t.title}</div>
                                                <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {t.project && <span>📁 {t.project.title}</span>}
                                                    {t.endTime && <span>📅 {new Date(t.endTime).toLocaleDateString()}</span>}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                    {t.estimatedHours}h est. → <strong style={{ color: '#059669' }}>{t.actualHours}h actual</strong>
                                                </div>
                                                {perf && (
                                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: perf.color, marginTop: 2 }}>
                                                        {perf.label}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
