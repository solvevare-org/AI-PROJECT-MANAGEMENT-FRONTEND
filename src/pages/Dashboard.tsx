import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const PROJECT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706'];

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats,      setStats]      = useState<any>(null);
    const [activity,   setActivity]   = useState<any[]>([]);
    const [actDays,    setActDays]    = useState(30);
    const [loading,    setLoading]    = useState(true);

    const load = useCallback(async () => {
        try {
            const [tRes, uRes, pRes, actRes, ovRes] = await Promise.all([
                api.get('/api/tasks'),
                api.get('/api/users'),
                api.get('/api/projects'),
                api.get('/api/activity?limit=8'),
                api.get('/api/tasks?overdue=true'),
            ]);
            const tasks = tRes.data;
            setStats({
                tasks: {
                    total:      tasks.length,
                    pending:    tasks.filter((t: any) => t.status === 'pending').length,
                    assigned:   tasks.filter((t: any) => t.status === 'assigned').length,
                    inProgress: tasks.filter((t: any) => t.status === 'in-progress').length,
                    done:       tasks.filter((t: any) => t.status === 'done').length,
                    overdue:    ovRes.data.length,
                },
                users:    { total: uRes.data.length },
                projects: { total: pRes.data.length, items: pRes.data.slice(0, 3) },
            });
            setActivity(actRes.data);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, [load]);

    if (loading) return <div className="loading-text">Loading dashboard...</div>;

    const doughnutData = {
        labels: ['Pending', 'Assigned', 'In Progress', 'Done'],
        datasets: [{
            data: [stats?.tasks.pending, stats?.tasks.assigned, stats?.tasks.inProgress, stats?.tasks.done],
            backgroundColor: ['#e5e7eb', '#93c5fd', '#fcd34d', '#6ee7b7'],
            borderColor:     ['#d1d5db', '#60a5fa', '#fbbf24', '#34d399'],
            borderWidth: 1,
        }],
    };

    const barData = {
        labels: ['Pending', 'Assigned', 'In Progress', 'Done'],
        datasets: [{
            data: [stats?.tasks.pending, stats?.tasks.assigned, stats?.tasks.inProgress, stats?.tasks.done],
            backgroundColor: ['#e5e7eb', '#bfdbfe', '#fde68a', '#bbf7d0'],
            borderColor:     ['#d1d5db', '#93c5fd', '#fcd34d', '#6ee7b7'],
            borderWidth: 1, borderRadius: 6,
        }],
    };

    const chartOpts: any = {
        responsive: true,
        plugins: { legend: { labels: { color: '#6b7280', font: { size: 11, family: 'Inter' }, boxWidth: 10 } } },
    };
    const barOpts: any = {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
        },
    };

    return (
        <div>
            <div className="welcome-section">
                <div>
                    <div className="welcome-heading">Welcome back, {user?.name} 👋</div>
                    <div className="welcome-sub">Here's what's happening with your projects today</div>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/projects?new=1')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Project
                </button>
            </div>

            {/* Stats */}
            <div className="stats-grid">
                {[
                    { icon: '📁', label: 'Total Projects',   value: stats?.projects.total ?? 0, cls: 'blue',   desc: 'All workspaces' },
                    { icon: '✅', label: 'Completed Tasks',  value: stats?.tasks.done ?? 0,     cls: 'green',  desc: 'Tasks finished' },
                    { icon: '⚡', label: 'In Progress',      value: stats?.tasks.inProgress ?? 0, cls: 'orange', desc: 'Active right now' },
                    { icon: '👥', label: 'Team Members',     value: stats?.users.total ?? 0,    cls: 'purple', desc: 'Active developers',  onClick: () => navigate('/developers') },
                    { icon: '🔴', label: 'Overdue Tasks',    value: stats?.tasks.overdue ?? 0,  cls: 'red',    desc: 'Past deadline',      onClick: () => navigate('/tasks') },
                ].map(s => (
                    <div className="stat-card" key={s.label} onClick={s.onClick} style={{ cursor: s.onClick ? 'pointer' : undefined }}>
                        <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                        <div className="stat-body">
                            <div className="stat-label">{s.label}</div>
                            <div className={`stat-value ${s.cls}`}>{s.value}</div>
                            <div className="stat-desc">{s.desc}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="dashboard-grid">
                <div className="dashboard-left">
                    {/* Project Overview */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Project Overview</span>
                            <span className="card-link" onClick={() => navigate('/projects')} style={{ cursor: 'pointer' }}>View all →</span>
                        </div>
                        {stats?.projects.items.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📂</div><div>No projects yet</div></div>
                        ) : stats?.projects.items.map((proj: any, i: number) => {
                            const done  = proj.tasks?.filter((t: any) => t.status === 'done').length ?? 0;
                            const total = proj.tasks?.length ?? 0;
                            const pct   = total ? Math.round((done / total) * 100) : 0;
                            return (
                                <div className="project-overview-item" key={proj._id}>
                                    <span className="project-color-dot" style={{ background: PROJECT_COLORS[i % 4] }} />
                                    <div className="project-overview-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span className="project-overview-name">{proj.title}</span>
                                            <span className={`badge badge-${proj.status}`}>{proj.status}</span>
                                        </div>
                                        <div className="project-overview-meta">
                                            <span>📅 {new Date(proj.createdAt).toLocaleDateString()}</span>
                                            <span>🗂 {total} tasks</span>
                                        </div>
                                        <div className="progress-wrap">
                                            <div className="progress-bar-bg">
                                                <div className="progress-bar-fill" style={{ width: `${pct}%`, background: PROJECT_COLORS[i % 4] }} />
                                            </div>
                                            <span className="progress-pct">{pct}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Charts */}
                    <div className="grid-2">
                        <div className="card">
                            <div className="card-header"><span className="card-title">Task Distribution</span></div>
                            <Doughnut data={doughnutData} options={chartOpts} />
                        </div>
                        <div className="card">
                            <div className="card-header"><span className="card-title">Tasks by Status</span></div>
                            <Bar data={barData} options={barOpts} />
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Recent Activity</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[7, 14, 30].map(d => (
                                    <button key={d}
                                        onClick={() => setActDays(d)}
                                        style={{
                                            padding: '2px 10px', borderRadius: 100, cursor: 'pointer',
                                            fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
                                            border: `1px solid ${actDays === d ? 'var(--accent-blue)' : 'var(--border)'}`,
                                            background: actDays === d ? 'var(--accent-blue)' : 'transparent',
                                            color: actDays === d ? '#fff' : 'var(--text-muted)',
                                        }}
                                    >{d}d</button>
                                ))}
                            </div>
                        </div>
                        {activity.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">📋</div>
                                <div>No recent activity</div>
                            </div>
                        ) : (
                            <div>
                                {activity.map((event: any, i: number) => {
                                    const ts  = new Date(event.timestamp);
                                    const now = Date.now();
                                    const diff = now - ts.getTime();
                                    const mins = Math.floor(diff / 60000);
                                    const hrs  = Math.floor(mins / 60);
                                    const days = Math.floor(hrs / 24);
                                    const timeLabel = mins < 1 ? 'just now'
                                        : mins < 60 ? `${mins}m ago`
                                        : hrs  < 24 ? `${hrs}h ago`
                                        : days < 7  ? `${days}d ago`
                                        : ts.toLocaleDateString();
                                    return (
                                        <div className="activity-item" key={event.id}>
                                            <div className="activity-dot" style={{ background: event.color }} />
                                            <div style={{ flex: 1 }}>
                                                <div
                                                    className="activity-text"
                                                    dangerouslySetInnerHTML={{ __html: event.text }}
                                                />
                                                <div className="activity-time">{timeLabel}</div>
                                            </div>
                                            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{event.icon}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="dashboard-right">
                    {/* Quick Stats */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">Quick Stats</span></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Pending',     value: stats?.tasks.pending ?? 0,    color: '#6b7280' },
                                { label: 'Assigned',    value: stats?.tasks.assigned ?? 0,   color: '#2563eb' },
                                { label: 'In Progress', value: stats?.tasks.inProgress ?? 0, color: '#d97706' },
                                { label: 'Done',        value: stats?.tasks.done ?? 0,       color: '#059669' },
                                { label: 'Overdue',     value: stats?.tasks.overdue ?? 0,    color: '#dc2626' },
                            ].map(item => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>{item.label}</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: item.color }}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Team */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Team</span>
                            <span className="card-link" onClick={() => navigate('/developers')} style={{ cursor: 'pointer' }}>View →</span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {stats?.users.total ?? 0} total members
                        </div>
                    </div>

                    {/* Proposals shortcut */}
                    <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/proposals')}>
                        <div className="card-header">
                            <span className="card-title">Pending Proposals</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Review developer signup requests
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Developer Dashboard ───────────────────────────────────────────────────────
function DeveloperDashboard() {
    const navigate  = useNavigate();
    const { user }  = useAuth();
    const [myTasks,   setMyTasks]   = useState<any[]>([]);
    const [profile,   setProfile]   = useState<any>(null);
    const [projects,  setProjects]  = useState<any[]>([]);
    const [overdue,   setOverdue]   = useState(0);
    const [loading,   setLoading]   = useState(true);

    const load = useCallback(async () => {
        if (!user?._id) return;
        try {
            const [taskRes, meRes, projRes, ovRes] = await Promise.all([
                api.get(`/api/tasks?assignedTo=${user._id}`),
                api.get('/api/auth/me'),
                api.get('/api/projects'),
                api.get(`/api/tasks?assignedTo=${user._id}&overdue=true`),
            ]);
            setMyTasks(taskRes.data);
            setProfile(meRes.data);
            setOverdue(ovRes.data.length);

            // Only show projects that have at least one of my tasks
            const myProjectIds = new Set(
                taskRes.data.filter((t: any) => t.project?._id).map((t: any) => t.project._id)
            );
            setProjects(projRes.data.filter((p: any) => myProjectIds.has(p._id)));
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [user?._id]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="loading-text">Loading dashboard...</div>;

    const active    = myTasks.filter(t => t.status !== 'done');
    const done      = myTasks.filter(t => t.status === 'done');
    const inProgress = myTasks.filter(t => t.status === 'in-progress');

    // Skill scores from profile
    const scores = Object.entries(profile?.scoreMap || {}) as [string, number][];
    const avgScore = scores.length
        ? Math.round(scores.reduce((s, [, v]) => s + v, 0) / scores.length)
        : 0;
    const scoreColor = avgScore >= 80 ? '#059669' : avgScore >= 60 ? '#2563eb' : '#d97706';

    const STATUS_CLS: Record<string, string> = {
        pending: 'badge-pending', assigned: 'badge-assigned',
        'in-progress': 'badge-in-progress', done: 'badge-done',
    };
    const PRIORITY_CLS: Record<string, string> = {
        low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
    };

    return (
        <div>
            <div className="welcome-section">
                <div>
                    <div className="welcome-heading">Welcome back, {user?.name} 👋</div>
                    <div className="welcome-sub">Here's your personal workspace overview</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/tasks')}>
                    View All My Tasks →
                </button>
            </div>

            {/* Dev Stats */}
            <div className="stats-grid">
                {[
                    { icon: '📋', label: 'My Tasks',     value: myTasks.length,    cls: 'blue',   desc: 'Total assigned' },
                    { icon: '⚡', label: 'In Progress',  value: inProgress.length, cls: 'orange', desc: 'Active right now' },
                    { icon: '✅', label: 'Completed',    value: done.length,       cls: 'green',  desc: 'Tasks finished' },
                    { icon: '⭐', label: 'Avg Score',    value: avgScore,          cls: 'purple', desc: 'Skill performance' },
                    { icon: '🔴', label: 'Overdue',      value: overdue,           cls: 'red',    desc: 'Past deadline' },
                ].map(s => (
                    <div className="stat-card" key={s.label}>
                        <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                        <div className="stat-body">
                            <div className="stat-label">{s.label}</div>
                            <div className={`stat-value ${s.cls}`}>{s.value}</div>
                            <div className="stat-desc">{s.desc}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="dashboard-grid">
                <div className="dashboard-left">

                    {/* My Active Tasks */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">My Active Tasks</span>
                            <span className="card-link" onClick={() => navigate('/tasks')} style={{ cursor: 'pointer' }}>View all →</span>
                        </div>
                        {active.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">🎉</div>
                                <div style={{ fontSize: '0.82rem' }}>No active tasks — you're all caught up!</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {active.slice(0, 5).map((t: any) => (
                                    <div key={t._id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 8,
                                        background: 'var(--bg-app)', border: '1px solid var(--border)',
                                        cursor: 'pointer',
                                    }} onClick={() => navigate('/tasks')}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 3 }}>{t.title}</div>
                                            {t.project && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📁 {t.project.title}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <span className={`badge ${PRIORITY_CLS[t.priority]}`}>{t.priority}</span>
                                            <span className={`badge ${STATUS_CLS[t.status]}`}>{t.status}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.estimatedHours}h</div>
                                    </div>
                                ))}
                                {active.length > 5 && (
                                    <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', textAlign: 'center', cursor: 'pointer', paddingTop: 4 }}
                                        onClick={() => navigate('/tasks')}>
                                        +{active.length - 5} more tasks →
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* My Projects */}
                    {projects.length > 0 && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">My Projects</span>
                            </div>
                            {projects.slice(0, 3).map((proj: any, i: number) => {
                                // Progress based only on my tasks in this project
                                const projMyTasks = myTasks.filter(t => t.project?._id === proj._id);
                                const myDone  = projMyTasks.filter(t => t.status === 'done').length;
                                const pct     = projMyTasks.length ? Math.round((myDone / projMyTasks.length) * 100) : 0;
                                return (
                                    <div className="project-overview-item" key={proj._id}>
                                        <span className="project-color-dot" style={{ background: PROJECT_COLORS[i % 4] }} />
                                        <div className="project-overview-info">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <span className="project-overview-name">{proj.title}</span>
                                                <span className={`badge badge-${proj.status}`}>{proj.status}</span>
                                            </div>
                                            <div className="project-overview-meta">
                                                <span>🗂 {projMyTasks.length} my tasks</span>
                                                <span>✅ {myDone} done</span>
                                            </div>
                                            <div className="progress-wrap">
                                                <div className="progress-bar-bg">
                                                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: PROJECT_COLORS[i % 4] }} />
                                                </div>
                                                <span className="progress-pct">{pct}%</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="dashboard-right">

                    {/* Skill Scores */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">My Skill Scores</span>
                            <span className="card-link" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>Profile →</span>
                        </div>
                        {scores.length === 0 ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                                Complete tasks to earn scores
                            </div>
                        ) : (
                            <>
                                {/* Avg score badge */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                                    background: `${scoreColor}10`, border: `1px solid ${scoreColor}30`,
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: scoreColor }}>{avgScore}</div>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: scoreColor }}>AVERAGE SCORE</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{profile?.totalTasksCompleted ?? 0} tasks completed</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {scores.sort(([, a], [, b]) => b - a).slice(0, 5).map(([skill, score]) => (
                                        <div key={skill}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{skill}</span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : '#d97706' }}>{score}</span>
                                            </div>
                                            <div className="score-bar-container" style={{ height: 6 }}>
                                                <div className="score-bar" style={{
                                                    width: `${score}%`,
                                                    background: score >= 80 ? '#059669' : score >= 60 ? '#2563eb' : '#d97706',
                                                }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Task breakdown */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">My Task Breakdown</span></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Assigned',    value: myTasks.filter(t => t.status === 'assigned').length,    color: '#2563eb' },
                                { label: 'In Progress', value: inProgress.length,                                       color: '#d97706' },
                                { label: 'Done',        value: done.length,                                             color: '#059669' },
                            ].map(item => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>{item.label}</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: item.color }}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Root export — picks view by role ─────────────────────────────────────────
export default function Dashboard() {
    const { isAdmin } = useAuth();
    return isAdmin ? <AdminDashboard /> : <DeveloperDashboard />;
}
