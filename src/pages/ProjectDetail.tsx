import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Task {
    _id: string; title: string; description: string;
    status: string; priority: string; skills: string[];
    estimatedHours: number; actualHours: number | null;
    assignedTo: { _id: string; name: string } | null;
}

interface Requirement { _id: string; filename: string; uploadedAt: string; }

interface Project {
    _id: string; title: string; description: string;
    status: string; priority: string;
    startDate?: string; endDate?: string;
    createdAt: string;
    tasks: Task[];
    requirements: Requirement[];
}

interface TimelineItem {
    taskId: string; title: string; priority: string; status: string;
    skills: string[]; estimatedHours: number; etaHours: number;
    assignedTo: { id: string; name: string } | null;
    actualHours: number | null;
}

interface Stats {
    total: number; pending: number; assigned: number;
    inProgress: number; done: number;
    totalEstimatedHours: number; totalActualHours: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CLS: Record<string, string> = {
    pending: 'badge-pending', assigned: 'badge-assigned',
    'in-progress': 'badge-in-progress', done: 'badge-done',
};
const PRIORITY_CLS: Record<string, string> = {
    low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
};
const STATUS_COLORS: Record<string, string> = {
    pending: '#64748b', assigned: '#3b82f6', 'in-progress': '#f59e0b', done: '#10b981',
};
const PROJECT_STATUS_CLS: Record<string, string> = {
    planning: 'badge-planning', active: 'badge-assigned',
    'on-hold': 'badge-high', completed: 'badge-done', cancelled: 'badge-pending',
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProjectDetail() {
    const { id }       = useParams<{ id: string }>();
    const navigate     = useNavigate();
    const { isAdmin }  = useAuth();

    const [project,  setProject]  = useState<Project | null>(null);
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [stats,    setStats]    = useState<Stats | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [tab,      setTab]      = useState<'overview' | 'tasks' | 'timeline' | 'requirements'>('overview');
    const [deleting, setDeleting] = useState(false);

    const fetchAll = useCallback(async () => {
        if (!id) return;
        try {
            const [projRes, tlRes, stRes] = await Promise.all([
                api.get(`/api/projects/${id}`),
                api.get(`/api/projects/${id}/timeline`),
                api.get(`/api/projects/${id}/stats`),
            ]);
            setProject(projRes.data);
            setTimeline(tlRes.data.timeline || []);
            setStats(stRes.data);
        } catch {
            toast.error('Failed to load project');
            navigate('/projects');
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleDelete = async () => {
        if (!project) return;
        if (!confirm(`Delete "${project.title}" and all its tasks? This cannot be undone.`)) return;
        setDeleting(true);
        try {
            await api.delete(`/api/projects/${id}`);
            toast.success('Project deleted');
            navigate('/projects');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Delete failed');
            setDeleting(false);
        }
    };

    if (loading) return <div className="loading-text">Loading project...</div>;
    if (!project) return null;

    const progress = project.tasks.length
        ? Math.round((project.tasks.filter(t => t.status === 'done').length / project.tasks.length) * 100)
        : 0;

    const maxEta = Math.max(...timeline.map(t => t.etaHours), 1);

    const TABS = [
        { key: 'overview',     label: '📊 Overview' },
        { key: 'tasks',        label: `✅ Tasks (${project.tasks.length})` },
        { key: 'timeline',     label: `📅 Timeline (${timeline.length})` },
        { key: 'requirements', label: `📄 Files (${project.requirements.length})` },
    ] as const;

    return (
        <div>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/projects')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                        Projects
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1 className="page-title" style={{ marginBottom: 0 }}>{project.title}</h1>
                            <span className={`badge ${PROJECT_STATUS_CLS[project.status] || 'badge-pending'}`}>{project.status}</span>
                            {project.priority && <span className={`badge ${PRIORITY_CLS[project.priority] || 'badge-medium'}`}>{project.priority}</span>}
                        </div>
                        {project.description && (
                            <p className="page-subtitle" style={{ marginTop: 4 }}>{project.description}</p>
                        )}
                    </div>
                </div>
                {isAdmin && (
                    <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
                        {deleting ? <span className="spinner" style={{ borderTopColor: '#dc2626' }} /> : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        )}
                        Delete Project
                    </button>
                )}
            </div>

            {/* ── Tabs ── */}
            <div className="project-detail-tabs">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        className={`project-detail-tab ${tab === t.key ? 'active' : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ══ OVERVIEW TAB ══ */}
            {tab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Stats row */}
                    <div className="stats-grid">
                        {[
                            { icon: '📋', label: 'Total Tasks',    value: stats?.total ?? 0,              cls: 'blue' },
                            { icon: '⚡', label: 'In Progress',    value: stats?.inProgress ?? 0,         cls: 'orange' },
                            { icon: '✅', label: 'Done',           value: stats?.done ?? 0,               cls: 'green' },
                            { icon: '⏱', label: 'Est. Hours',     value: `${stats?.totalEstimatedHours ?? 0}h`, cls: 'purple' },
                        ].map(s => (
                            <div className="stat-card" key={s.label}>
                                <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                                <div className="stat-body">
                                    <div className="stat-label">{s.label}</div>
                                    <div className={`stat-value ${s.cls}`}>{s.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {/* Progress */}
                        <div className="card">
                            <div className="card-header"><span className="card-title">Progress</span><span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{progress}%</span></div>
                            <div className="progress-bar-bg" style={{ height: 10, marginBottom: 12 }}>
                                <div className="progress-bar-fill" style={{ width: `${progress}%`, height: '100%' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                <span>{project.tasks.filter(t => t.status === 'done').length} of {project.tasks.length} tasks done</span>
                                {stats && stats.totalActualHours > 0 && (
                                    <span>{stats.totalActualHours}h actual / {stats.totalEstimatedHours}h estimated</span>
                                )}
                            </div>
                        </div>

                        {/* Project info */}
                        <div className="card">
                            <div className="card-header"><span className="card-title">Details</span></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Created</span>
                                    <span style={{ fontWeight: 600 }}>{new Date(project.createdAt).toLocaleDateString()}</span>
                                </div>
                                {project.startDate && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Start Date</span>
                                        <span style={{ fontWeight: 600 }}>{new Date(project.startDate).toLocaleDateString()}</span>
                                    </div>
                                )}
                                {project.endDate && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>End Date</span>
                                        <span style={{ fontWeight: 600 }}>{new Date(project.endDate).toLocaleDateString()}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Requirements</span>
                                    <span style={{ fontWeight: 600 }}>{project.requirements.length} file{project.requirements.length !== 1 ? 's' : ''}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Developers on this project */}
                    {(() => {
                        const devMap = new Map<string, { name: string; total: number; done: number; inProgress: number }>();
                        project.tasks.forEach(t => {
                            if (!t.assignedTo) return;
                            const id = t.assignedTo._id;
                            const existing = devMap.get(id) ?? { name: t.assignedTo.name, total: 0, done: 0, inProgress: 0 };
                            existing.total++;
                            if (t.status === 'done') existing.done++;
                            if (t.status === 'in-progress') existing.inProgress++;
                            devMap.set(id, existing);
                        });
                        const devs = Array.from(devMap.values());
                        if (devs.length === 0) return null;
                        return (
                            <div className="card">
                                <div className="card-header"><span className="card-title">Developers on this Project</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {devs.map(dev => {
                                        const pct = dev.total ? Math.round((dev.done / dev.total) * 100) : 0;
                                        const statusColor = dev.inProgress > 0 ? '#d97706' : dev.done === dev.total ? '#059669' : '#2563eb';
                                        const statusLabel = dev.inProgress > 0 ? 'In Progress' : dev.done === dev.total ? 'Completed' : 'Assigned';
                                        return (
                                            <div key={dev.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{
                                                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                                    background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.8rem', fontWeight: 700,
                                                }}>{dev.name.charAt(0).toUpperCase()}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.855rem' }}>{dev.name}</span>
                                                        <span style={{
                                                            fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px',
                                                            borderRadius: 100, background: `${statusColor}15`,
                                                            color: statusColor, border: `1px solid ${statusColor}30`,
                                                        }}>{statusLabel}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div className="progress-bar-bg" style={{ flex: 1 }}>
                                                            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: statusColor }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                                            {dev.done}/{dev.total} tasks
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Task status breakdown */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">Task Status Breakdown</span></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Pending',     value: stats?.pending ?? 0,    color: '#64748b' },
                                { label: 'Assigned',    value: stats?.assigned ?? 0,   color: '#3b82f6' },
                                { label: 'In Progress', value: stats?.inProgress ?? 0, color: '#f59e0b' },
                                { label: 'Done',        value: stats?.done ?? 0,       color: '#10b981' },
                            ].map(item => {
                                const pct = stats?.total ? Math.round((item.value / stats.total) * 100) : 0;
                                return (
                                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ width: 80, fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{item.label}</span>
                                        <div className="progress-bar-bg" style={{ flex: 1 }}>
                                            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: item.color }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.color, minWidth: 28, textAlign: 'right' }}>{item.value}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ══ TASKS TAB ══ */}
            {tab === 'tasks' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {project.tasks.length === 0 ? (
                        <div className="empty-state" style={{ padding: '48px 32px' }}>
                            <div className="empty-icon">🤖</div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>No tasks yet</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Upload a requirements file to generate AI tasks</div>
                        </div>
                    ) : (
                        <div>
                            {/* Sort by priority */}
                            {[...project.tasks]
                                .sort((a, b) => {
                                    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                                    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
                                })
                                .map((task, idx) => (
                                    <div key={task._id} style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '14px 20px',
                                        borderBottom: idx < project.tasks.length - 1 ? '1px solid var(--border)' : 'none',
                                    }}>
                                        {/* Serial */}
                                        <div style={{
                                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                            background: idx === 0 ? '#fef2f2' : idx === 1 ? '#fffbeb' : '#f3f4f6',
                                            color: idx === 0 ? '#dc2626' : idx === 1 ? '#d97706' : '#6b7280',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.62rem', fontWeight: 800,
                                        }}>#{idx + 1}</div>

                                        <div style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: STATUS_COLORS[task.status] || '#64748b' }} />

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 3 }}>{task.title}</div>
                                            {task.description && (
                                                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                                                    {task.description.length > 100 ? task.description.slice(0, 100) + '...' : task.description}
                                                </div>
                                            )}
                                            <div className="skills-wrap">
                                                {task.skills.map(s => <span key={s} className="skill-tag" style={{ fontSize: '0.65rem' }}>{s}</span>)}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                                            <span className={`badge ${PRIORITY_CLS[task.priority]}`}>{task.priority}</span>
                                            <span className={`badge ${STATUS_CLS[task.status]}`}>{task.status}</span>
                                        </div>

                                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {task.assignedTo ? `👤 ${task.assignedTo.name}` : '⏳ Unassigned'}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 2 }}>
                                                {task.estimatedHours}h est.
                                                {task.actualHours != null && (
                                                    <span style={{ color: '#059669', marginLeft: 4 }}>/ {task.actualHours}h actual</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    )}
                </div>
            )}

            {/* ══ TIMELINE TAB ══ */}
            {tab === 'timeline' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {timeline.length === 0 ? (
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-icon">📅</div>
                                <div>No timeline data yet</div>
                            </div>
                        </div>
                    ) : timeline.map(item => {
                        const barWidth = Math.min((item.etaHours / maxEta) * 100, 100);
                        const color    = STATUS_COLORS[item.status] || '#64748b';
                        return (
                            <div className="card" key={item.taskId} style={{ padding: '14px 18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                                        <div className="skills-wrap" style={{ gap: 4 }}>
                                            {item.skills.map(s => <span key={s} className="skill-tag" style={{ fontSize: '0.65rem' }}>{s}</span>)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ESTIMATED</div>
                                            <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{item.estimatedHours}h</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ADJ. ETA</div>
                                            <div style={{ fontWeight: 700, color }}>{item.etaHours}h</div>
                                        </div>
                                        {item.actualHours != null && (
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ACTUAL</div>
                                                <div style={{ fontWeight: 700, color: '#059669' }}>{item.actualHours}h</div>
                                            </div>
                                        )}
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>DEVELOPER</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.assignedTo?.name ?? '—'}</div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="timeline-bar-container">
                                        <div className="timeline-bar" style={{ width: `${barWidth}%`, background: color }} />
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color, fontWeight: 600, minWidth: 90, textAlign: 'right' }}>
                                        {item.status === 'done' ? '✅ Done' : item.status === 'in-progress' ? '⚡ In Progress' : item.status}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ══ REQUIREMENTS TAB ══ */}
            {tab === 'requirements' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {project.requirements.length === 0 ? (
                        <div className="empty-state" style={{ padding: '48px 32px' }}>
                            <div className="empty-icon">📄</div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>No files uploaded</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Create a new project and upload a requirements file</div>
                        </div>
                    ) : (
                        project.requirements.map((req, idx) => (
                            <div key={req._id} style={{
                                display: 'flex', alignItems: 'center', gap: 14,
                                padding: '14px 20px',
                                borderBottom: idx < project.requirements.length - 1 ? '1px solid var(--border)' : 'none',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                    background: '#eff6ff', color: '#2563eb',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1rem',
                                }}>📄</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 2 }}>{req.filename}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        Uploaded {new Date(req.uploadedAt).toLocaleDateString()} at {new Date(req.uploadedAt).toLocaleTimeString()}
                                    </div>
                                </div>
                                <span className="badge badge-done">Processed</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
