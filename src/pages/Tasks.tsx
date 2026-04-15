import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface Task {
    _id: string; title: string; description: string;
    skills: string[]; priority: string; status: string;
    estimatedHours: number; actualHours: number | null;
    totalWorkedSeconds: number;
    sessionStart: string | null;
    deadline: string | null;
    assignedTo: { _id: string; name: string } | null;
    project?: { _id: string; title: string };
}

interface ProjectGroup {
    _id: string; title: string; description: string;
    status: string; tasks: Task[];
}

const STATUS_CLS: Record<string, string> = {
    pending: 'badge-pending', assigned: 'badge-assigned',
    'in-progress': 'badge-in-progress', done: 'badge-done',
};
const PRIORITY_CLS: Record<string, string> = {
    low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
};
const STATUS_DOT: Record<string, string> = {
    done: '#059669', 'in-progress': '#d97706', assigned: '#2563eb', pending: '#d1d5db',
};
const PROJECT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];

// Format hours: clean human-readable display
// 0.5  → "30 mins"
// 1.5  → "1h 30 mins"
// 3    → "3h"
// 41.5 → "41h 30 mins"
// 41.410000000000004 → "41h 25 mins" (float precision safe)
const fmtHours = (h: number): string => {
    if (!h || h <= 0) return '0 mins';
    const totalMins = Math.round(h * 60);   // convert to minutes, round away float noise
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs === 0) return `${mins} mins`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins} mins`;
};

// Format seconds → "1h 23m 45s"
const fmtTime = (secs: number): string => {
    if (!secs || secs < 0) return '0s';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

// Live timer hook — ticks every second while task is in-progress
function useLiveSeconds(task: Task): number {
    const [extra, setExtra] = useState(0);
    useEffect(() => {
        if (task.status !== 'in-progress' || !task.sessionStart) {
            setExtra(0);
            return;
        }
        const base = Math.floor((Date.now() - new Date(task.sessionStart).getTime()) / 1000);
        setExtra(base);
        const id = setInterval(() => {
            setExtra(Math.floor((Date.now() - new Date(task.sessionStart!).getTime()) / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, [task.status, task.sessionStart]);
    return (task.totalWorkedSeconds || 0) + extra;
}

// ── Task Row with live timer ─────────────────────────────────────────────────
function TaskRow({ task, serial, isAdmin, user, actionLoading, onOpen, onAssign, onStart, onPause, onComplete, onAddToMy }: {
    task: Task; serial: number; isAdmin: boolean; user: any;
    actionLoading: string | null;
    onOpen: () => void; onAssign: () => void; onStart: () => void;
    onPause: () => void; onComplete: () => void; onAddToMy: () => void;
}) {
    const liveSeconds = useLiveSeconds(task);
    const isMyTask = task.assignedTo?._id === user?._id;
    // Admin can act on any task; developer can only act on their own assigned tasks
    const canAct = isAdmin || isMyTask;

    return (
        <div className="task-row task-row-clickable" onClick={onOpen}>
            {/* Serial */}
            <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: serial === 1 ? '#fef2f2' : serial === 2 ? '#fffbeb' : '#f3f4f6',
                color: serial === 1 ? '#dc2626' : serial === 2 ? '#d97706' : '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 800,
                border: `1px solid ${serial === 1 ? '#fecaca' : serial === 2 ? '#fde68a' : '#e5e7eb'}`,
            }}>#{serial}</div>

            <div className="task-row-status-dot" style={{ background: STATUS_DOT[task.status] || '#d1d5db' }} />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.855rem', color: 'var(--text-primary)' }}>{task.title}</span>
                    <span className={`badge ${PRIORITY_CLS[task.priority]}`}>{task.priority}</span>
                    <span className={`badge ${STATUS_CLS[task.status]}`}>{task.status}</span>
                    {/* "My Task" highlight badge for the assigned developer */}
                    {isMyTask && task.status !== 'done' && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '2px 8px', borderRadius: 100,
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            fontSize: '0.68rem', fontWeight: 700, color: '#2563eb',
                        }}>👤 My Task</span>
                    )}
                    {/* Live timer badge */}
                    {task.status === 'in-progress' && liveSeconds > 0 && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 100,
                            background: '#fffbeb', border: '1px solid #fde68a',
                            fontSize: '0.72rem', fontWeight: 700, color: '#d97706',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            ⏱ {fmtTime(liveSeconds)}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                    {task.description
                        .replace(/\n/g, ' ')
                        .replace(/\d+[\.\):]+\s*/g, '')
                        .trim()
                        .slice(0, 90) + (task.description.length > 90 ? '...' : '')}
                </div>
                {task.deadline && (() => {
                    const isOverdue = task.status !== 'done' && new Date(task.deadline) < new Date();
                    return (
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: isOverdue ? '#dc2626' : 'var(--text-muted)', marginBottom: 4 }}>
                            {isOverdue ? '🔴' : '📅'} Due: {new Date(task.deadline).toLocaleDateString()}
                        </div>
                    );
                })()}
                <div className="skills-wrap">
                    {task.skills.map(s => <span key={s} className="skill-tag">{s}</span>)}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                {/* Est / Worked */}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Est. / Worked</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {fmtHours(task.estimatedHours)}
                        {liveSeconds > 0 && (
                            <span style={{ color: task.status === 'done' ? '#059669' : '#d97706', marginLeft: 4 }}>
                                / {fmtTime(liveSeconds)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Assigned developer name */}
                <div style={{ fontSize: '0.82rem', minWidth: 100 }}>
                    {task.assignedTo
                        ? <div>
                            <div style={{
                                fontWeight: 600,
                                color: isMyTask ? '#2563eb' : 'var(--text-secondary)',
                            }}>
                                {isMyTask ? '👤 You' : `👤 ${task.assignedTo.name}`}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{fmtHours(task.estimatedHours)} estimated</div>
                          </div>
                        : <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 100,
                            background: '#f3f4f6', border: '1px solid #e5e7eb',
                            fontSize: '0.72rem', fontWeight: 600, color: '#6b7280',
                          }}>⏳ Pending Assignment</span>
                    }
                </div>

                <div className="btn-group">
                    {/* Admin-only: Assign pending task */}
                    {isAdmin && task.status === 'pending' && (
                        <button className="btn btn-primary btn-sm" disabled={!!actionLoading} onClick={onAssign}>
                            {actionLoading === task._id + 'assign' ? <span className="spinner" /> : '🎯 Assign'}
                        </button>
                    )}
                    {/* Developer: self-assign a pending task (only if not already assigned to someone) */}
                    {!isAdmin && task.status === 'pending' && !task.assignedTo && (
                        <button className="btn btn-success btn-sm" disabled={!!actionLoading} onClick={onAddToMy}>
                            {actionLoading === task._id + 'addtomy'
                                ? <span className="spinner" style={{ borderTopColor: '#059669' }} />
                                : '+ Add To My Task'}
                        </button>
                    )}
                    {/* Start — only assigned developer or admin */}
                    {task.status === 'assigned' && canAct && (
                        <button className="btn btn-warning btn-sm" disabled={!!actionLoading} onClick={onStart}>
                            {actionLoading === task._id + 'start' ? '...' : '▶ Start'}
                        </button>
                    )}
                    {/* Pause + Complete — only assigned developer or admin */}
                    {task.status === 'in-progress' && canAct && (
                        <div className="btn-group">
                            <button className="btn btn-warning btn-sm" disabled={!!actionLoading} onClick={onPause}>
                                {actionLoading === task._id + 'pause' ? '...' : '⏸ Pause'}
                            </button>
                            <button className="btn btn-success btn-sm" disabled={!!actionLoading} onClick={onComplete}>
                                {actionLoading === task._id + 'complete' ? '...' : '✅ Complete'}
                            </button>
                        </div>
                    )}
                    {/* Done state */}
                    {task.status === 'done' && (
                        <span style={{ fontSize: '0.775rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                            ✅ {task.actualHours != null ? `${task.actualHours}h total` : 'Done'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
function TaskModal({ task, isAdmin, onClose, onSaved }: {
    task: Task; isAdmin: boolean;
    onClose: () => void; onSaved: () => void;
}) {
    const liveSeconds = useLiveSeconds(task);
    const [editing, setEditing]   = useState(false);
    const [saving, setSaving]     = useState(false);
    const [skillInput, setSkillInput] = useState('');
    const [form, setForm] = useState({
        title:          task.title,
        description:    task.description,
        priority:       task.priority,
        status:         task.status,
        estimatedHours: task.estimatedHours,
        skills:         [...task.skills],
        deadline:       task.deadline ? task.deadline.slice(0, 10) : '',
    });

    const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

    const addSkill = () => {
        const s = skillInput.trim();
        if (s && !form.skills.includes(s)) {
            set('skills', [...form.skills, s]);
            setSkillInput('');
        }
    };

    const removeSkill = (s: string) => set('skills', form.skills.filter(x => x !== s));

    const handleSave = async () => {
        if (!form.title.trim()) return toast.error('Task name is required');
        setSaving(true);
        try {
            await api.put(`/api/tasks/${task._id}`, {
                title:          form.title.trim(),
                description:    form.description.trim(),
                priority:       form.priority,
                status:         form.status,
                estimatedHours: Number(form.estimatedHours),
                skills:         form.skills,
                deadline:       form.deadline || null,
            });
            toast.success('✅ Task updated successfully!');
            onSaved();
            setEditing(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Update failed');
        } finally { setSaving(false); }
    };

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal" style={{ maxWidth: 560 }}>
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <div className="modal-title">{editing ? 'Edit Task' : 'Task Details'}</div>
                        <div className="modal-subtitle">
                            {task.project?.title && <span>📁 {task.project.title}</span>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {isAdmin && !editing && (
                            <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Update
                            </button>
                        )}
                        <button className="modal-close" onClick={onClose}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                <div className="modal-body">
                    {!editing ? (
                        /* ── View Mode ── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Title + badges */}
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: 8 }}>{task.title}</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <span className={`badge ${PRIORITY_CLS[task.priority]}`}>{task.priority}</span>
                                    <span className={`badge ${STATUS_CLS[task.status]}`}>{task.status}</span>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <div className="task-modal-label">Description</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.8, background: '#f9fafb', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    {task.description
                                        ? task.description.split('\n').map((line, i) => {
                                            const trimmed = line.trim();
                                            if (!trimmed) return null;
                                            const isStep = /^\d+[\.\):]/.test(trimmed);
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex', gap: 10, marginBottom: 6,
                                                    alignItems: 'flex-start',
                                                }}>
                                                    {isStep && (
                                                        <span style={{
                                                            flexShrink: 0, minWidth: 22, height: 22,
                                                            borderRadius: '50%',
                                                            background: '#2563eb', color: '#fff',
                                                            fontSize: '0.68rem', fontWeight: 700,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            marginTop: 1,
                                                        }}>
                                                            {trimmed.match(/^(\d+)/)?.[1]}
                                                        </span>
                                                    )}
                                                    <span style={{ flex: 1 }}>
                                                        {isStep ? trimmed.replace(/^\d+[\.\):]+\s*/, '') : trimmed}
                                                    </span>
                                                </div>
                                            );
                                          }).filter(Boolean)
                                        : '—'
                                    }
                                </div>
                            </div>

                            {/* Skills */}
                            <div>
                                <div className="task-modal-label">Tech Stack / Skills</div>
                                {task.skills.length > 0
                                    ? <div className="skills-wrap">{task.skills.map(s => <span key={s} className="skill-tag">{s}</span>)}</div>
                                    : <span style={{ fontSize: '0.855rem', color: 'var(--text-muted)' }}>No skills specified</span>
                                }
                            </div>

                            {/* Est hours + assigned + worked time */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div className="task-modal-stat">
                                    <div className="task-modal-label">Estimated</div>
                                    <div className="task-modal-val">{fmtHours(task.estimatedHours)}</div>
                                </div>
                                <div className="task-modal-stat">
                                    <div className="task-modal-label">Worked So Far</div>
                                    <div className="task-modal-val" style={{ color: '#d97706' }}>
                                        {liveSeconds > 0 ? fmtTime(liveSeconds) : '—'}
                                    </div>
                                </div>
                                <div className="task-modal-stat">
                                    <div className="task-modal-label">{task.status === 'done' ? 'Total Time' : 'Assigned To'}</div>
                                    <div className="task-modal-val" style={{ fontSize: '0.82rem', color: task.status === 'done' ? '#059669' : undefined }}>
                                        {task.status === 'done'
                                            ? (task.actualHours != null ? fmtHours(task.actualHours) : '—')
                                            : task.assignedTo
                                                ? <span style={{ color: '#2563eb', fontWeight: 700 }}>👤 {task.assignedTo.name}</span>
                                                : <span style={{ color: '#6b7280' }}>⏳ Pending</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            {task.deadline && (() => {
                                const isOverdue = task.status !== 'done' && new Date(task.deadline) < new Date();
                                return (
                                    <div style={{
                                        padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                                        background: isOverdue ? '#fef2f2' : '#f9fafb',
                                        border: `1px solid ${isOverdue ? '#fecaca' : 'var(--border)'}`,
                                        color: isOverdue ? '#dc2626' : 'var(--text-secondary)',
                                    }}>
                                        {isOverdue ? '🔴 Overdue — ' : '📅 Deadline: '}
                                        {new Date(task.deadline).toLocaleDateString()}
                                    </div>
                                );
                            })()}
                            {liveSeconds > 0 && task.estimatedHours > 0 && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Progress</span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: liveSeconds > task.estimatedHours * 3600 ? '#dc2626' : '#d97706' }}>
                                            {Math.min(100, Math.round((liveSeconds / (task.estimatedHours * 3600)) * 100))}%
                                        </span>
                                    </div>
                                    <div className="progress-bar-bg" style={{ height: 8 }}>
                                        <div className="progress-bar-fill" style={{
                                            width: `${Math.min(100, (liveSeconds / (task.estimatedHours * 3600)) * 100)}%`,
                                            background: liveSeconds > task.estimatedHours * 3600 ? '#dc2626' : '#d97706',
                                        }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Worked: {fmtTime(liveSeconds)}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Est: {fmtHours(task.estimatedHours)}</span>
                                    </div>
                                </div>
                            )}

                            {!isAdmin && (
                                <div style={{ padding: '10px 14px', background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Only admins can edit tasks.
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ── Edit Mode (Admin only) ── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Title */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Task Name *</label>
                                <input className="form-input" value={form.title}
                                    onChange={e => set('title', e.target.value)} placeholder="Task title" />
                            </div>

                            {/* Description */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Description</label>
                                <textarea className="form-textarea" rows={3} value={form.description}
                                    onChange={e => set('description', e.target.value)}
                                    placeholder="Task description"
                                    style={{ resize: 'vertical', minHeight: 80 }} />
                            </div>

                            {/* Priority + Status */}
                            <div className="modal-row-2">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Priority</label>
                                    <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                                        <option value="pending">Pending</option>
                                        <option value="assigned">Assigned</option>
                                        <option value="in-progress">In Progress</option>
                                        <option value="done">Done</option>
                                    </select>
                                </div>
                            </div>

                            {/* Estimated Hours */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Estimated Hours</label>
                                <input className="form-input" type="number" min={0.5} step={0.5}
                                    value={form.estimatedHours}
                                    onChange={e => set('estimatedHours', e.target.value)} />
                            </div>

                            {/* Deadline */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Deadline</label>
                                <input className="form-input" type="date"
                                    value={form.deadline}
                                    onChange={e => set('deadline', e.target.value)} />
                            </div>

                            {/* Tech Stack / Skills */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Tech Stack / Skills</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="form-input" placeholder="e.g. React, Node.js"
                                        value={skillInput}
                                        onChange={e => setSkillInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())} />
                                    <button type="button" className="btn btn-outline btn-sm" onClick={addSkill}>+ Add</button>
                                </div>
                                {form.skills.length > 0 && (
                                    <div className="skills-wrap" style={{ marginTop: 8 }}>
                                        {form.skills.map(s => (
                                            <span key={s} className="skill-tag" style={{ cursor: 'pointer' }}
                                                onClick={() => removeSkill(s)}>
                                                {s} <span style={{ marginLeft: 3, opacity: 0.6 }}>×</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
                                <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                                    {saving ? <><span className="spinner" />Saving...</> : '✅ Save Changes'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main Tasks Page ───────────────────────────────────────────────────────────
export default function Tasks() {
    const { isAdmin, user } = useAuth();
    const [groups, setGroups]         = useState<ProjectGroup[]>([]);
    const [ungrouped, setUngrouped]   = useState<Task[]>([]);
    const [loading, setLoading]       = useState(true);
    const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedTask, setSelectedTask]   = useState<Task | null>(null);
    const [assignTask, setAssignTask] = useState<{ taskId: string; task: any; candidates: any[] } | null>(null);
    const [staleTasks, setStaleTasks] = useState<any[]>([]);
    const [reassignTarget, setReassignTarget] = useState<{ taskId: string; task: any; candidates: any[] } | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [tRes, pRes] = await Promise.all([api.get('/api/tasks'), api.get('/api/projects')]);
            const tasks: Task[]            = tRes.data;
            const projects: ProjectGroup[] = pRes.data;

            const grouped = projects.map(p => ({
                ...p,
                tasks: tasks.filter(t => t.project?._id === p._id),
            })).filter(p => p.tasks.length > 0);

            setGroups(grouped);
            setUngrouped(tasks.filter(t => !t.project));

            if (grouped.length > 0 && Object.keys(expanded).length === 0) {
                // Sirf pehla project default open
                setExpanded({ [grouped[0]._id]: true });
            }

            // Fetch stale tasks for admin
            if (isAdmin) {
                try {
                    const staleRes = await api.get('/api/tasks/stale');
                    setStaleTasks(staleRes.data);
                } catch { /* ignore */ }
            }
        } catch { toast.error('Failed to load tasks'); }
        finally { setLoading(false); }
    }, [isAdmin]); // eslint-disable-line

    useEffect(() => { fetchData(); }, [fetchData]);

    // Real-time polling every 15s
    useEffect(() => {
        const id = setInterval(fetchData, 15000);
        return () => clearInterval(id);
    }, [fetchData]);

    // Sirf ek project accordion ek waqt mein open — naya open karo toh purana band
    const toggleExpand = (id: string) =>
        setExpanded(e => ({ [id]: !e[id] }));

    const doAssign = async (taskId: string) => {
        setActionLoading(taskId + 'assign');
        try {
            const res = await api.get(`/api/tasks/${taskId}/candidates`);
            setAssignTask({ taskId, candidates: res.data.candidates, task: res.data.task });
        } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to load developers'); }
        finally { setActionLoading(null); }
    };

    const doStart = async (taskId: string) => {
        setActionLoading(taskId + 'start');
        try { await api.put(`/api/tasks/${taskId}/start`); toast.success('▶️ Task started!'); fetchData(); }
        catch (err: any) { toast.error(err.response?.data?.error || 'Start failed'); }
        finally { setActionLoading(null); }
    };

    const doPause = async (taskId: string) => {
        setActionLoading(taskId + 'pause');
        try { await api.put(`/api/tasks/${taskId}/pause`); toast.success('⏸️ Task paused'); fetchData(); }
        catch (err: any) { toast.error(err.response?.data?.error || 'Pause failed'); }
        finally { setActionLoading(null); }
    };

    const doComplete = async (taskId: string) => {
        setActionLoading(taskId + 'complete');
        try {
            const res = await api.put(`/api/tasks/${taskId}/complete`);
            const perf = res.data.performance;
            toast.success(
                perf
                    ? `${perf.label} — ${res.data.task.actualHours}h total • Score ${perf.delta > 0 ? '+' : ''}${perf.delta}`
                    : '🎉 Task completed!',
                { duration: 4000 }
            );
            fetchData();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Complete failed'); }
        finally { setActionLoading(null); }
    };

    const doAddToMyTask = async (taskId: string) => {
        if (!user) return toast.error('You must be logged in');
        setActionLoading(taskId + 'addtomy');
        try {
            await api.post(`/api/tasks/${taskId}/add-to-my-task`, { userId: user._id, source: 'auth' });
            toast.success('✅ Task added to your list!');
            fetchData();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to add task'); }
        finally { setActionLoading(null); }
    };

    // When task is saved in modal, refresh and update selectedTask with latest data
    const handleTaskSaved = async () => {
        await fetchData();
        if (selectedTask) {
            try {
                const res = await api.get(`/api/tasks/${selectedTask._id}`);
                setSelectedTask(res.data);
            } catch { /* ignore */ }
        }
    };

    const doConfirmAssign = async (userId: string, source: string) => {
        if (!assignTask) return;
        setActionLoading(assignTask.taskId + 'assigning');
        try {
            const res = await api.post(`/api/tasks/${assignTask.taskId}/assign-manual`, { userId, source });
            toast.success(res.data.message);
            setAssignTask(null);
            fetchData();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Assign failed'); }
        finally { setActionLoading(null); }
    };

    const openReassign = async (taskId: string, task: any) => {
        setActionLoading(taskId + 'reassign');
        try {
            const res = await api.get(`/api/tasks/${taskId}/candidates`);
            setReassignTarget({ taskId, task, candidates: res.data.candidates });
        } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to load developers'); }
        finally { setActionLoading(null); }
    };

    const doConfirmReassign = async (userId: string, source: string) => {
        if (!reassignTarget) return;
        setActionLoading(reassignTarget.taskId + 'reassigning');
        try {
            const res = await api.post(`/api/tasks/${reassignTarget.taskId}/reassign`, { userId, source });
            toast.success(res.data.message);
            setReassignTarget(null);
            fetchData();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Reassign failed'); }
        finally { setActionLoading(null); }
    };

    if (loading) return <div className="loading-text">Loading tasks...</div>;

    const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortByPriority = (tasks: Task[]) =>
        [...tasks].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));

    const totalTasks = groups.reduce((s, g) => s + g.tasks.length, 0) + ungrouped.length;

    const renderTaskRow = (task: Task, serial: number) => (
        <TaskRow
            key={task._id}
            task={task}
            serial={serial}
            isAdmin={isAdmin}
            user={user}
            actionLoading={actionLoading}
            onOpen={() => setSelectedTask(task)}
            onAssign={() => doAssign(task._id)}
            onStart={() => doStart(task._id)}
            onPause={() => doPause(task._id)}
            onComplete={() => doComplete(task._id)}
            onAddToMy={() => doAddToMyTask(task._id)}
        />
    );

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title">My Tasks</h1>
                    <p className="page-subtitle">
                        {totalTasks} tasks across {groups.length} projects · click any task to view details
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#059669', marginLeft: 8, verticalAlign: 'middle', animation: 'pulse 2s infinite' }} />
                    </p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={fetchData} title="Refresh">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Refresh
                </button>
            </div>

            {totalTasks === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.3 }}>🤖</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No tasks yet</div>
                    <div style={{ fontSize: '0.855rem', color: 'var(--text-muted)' }}>Create a project and upload requirements to generate AI tasks</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {groups.map((group, gi) => {
                        const color    = PROJECT_COLORS[gi % PROJECT_COLORS.length];
                        const done     = group.tasks.filter(t => t.status === 'done').length;
                        const progress = group.tasks.length ? Math.round((done / group.tasks.length) * 100) : 0;
                        const isOpen   = expanded[group._id];

                        return (
                            <div key={group._id} className="task-project-card">
                                <div className="task-project-header" onClick={() => toggleExpand(group._id)} style={{ borderLeftColor: color }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                        <div className="task-project-icon" style={{ background: color + '18', color }}>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{group.title}</span>
                                                <span className={`badge ${STATUS_CLS[group.status] || 'badge-pending'}`}>{group.status}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{group.tasks.length} tasks · {done} done</span>
                                            </div>
                                            {group.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{group.description}</div>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
                                            <div className="progress-bar-bg" style={{ flex: 1 }}>
                                                <div className="progress-bar-fill" style={{ width: `${progress}%`, background: color }} />
                                            </div>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 28 }}>{progress}%</span>
                                        </div>
                                    </div>
                                    <div style={{ marginLeft: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                    </div>
                                </div>

                                {isOpen && (
                                    <div className="task-list">
                                        {sortByPriority(group.tasks).map((task, idx) => renderTaskRow(task, idx + 1))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {ungrouped.length > 0 && (
                        <div className="task-project-card">
                            <div className="task-project-header" style={{ borderLeftColor: '#6b7280' }} onClick={() => toggleExpand('ungrouped')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                    <div className="task-project-icon" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Unassigned Tasks</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ungrouped.length} tasks</span>
                                </div>
                                <div style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expanded['ungrouped'] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                                </div>
                            </div>
                            {expanded['ungrouped'] && (
                                <div className="task-list">{sortByPriority(ungrouped).map((task, idx) => renderTaskRow(task, idx + 1))}</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Stale Tasks (Admin only) ── */}
            {isAdmin && staleTasks.length > 0 && (
                <div style={{ marginTop: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{
                            padding: '4px 12px', borderRadius: 100,
                            background: '#fef2f2', border: '1px solid #fecaca',
                            fontSize: '0.78rem', fontWeight: 700, color: '#dc2626',
                        }}>
                            ⚠️ {staleTasks.length} Idle Task{staleTasks.length > 1 ? 's' : ''} (2+ days not started)
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {staleTasks.map(t => {
                            const daysIdle = Math.floor((Date.now() - new Date(t.assignedAt).getTime()) / (1000 * 60 * 60 * 24));
                            return (
                                <div key={t._id} style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '14px 18px',
                                    background: '#fff', border: '1px solid #fecaca',
                                    borderLeft: '4px solid #dc2626',
                                    borderRadius: 10,
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 3 }}>{t.title}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                                            <span>📁 {t.project?.title || 'No project'}</span>
                                            <span>👤 Assigned to: <strong style={{ color: '#dc2626' }}>{t.assignedTo?.name || 'Unknown'}</strong></span>
                                            <span>📅 Idle: <strong style={{ color: '#dc2626' }}>{daysIdle} day{daysIdle !== 1 ? 's' : ''}</strong></span>
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        disabled={!!actionLoading}
                                        onClick={() => openReassign(t._id, t)}
                                    >
                                        {actionLoading === t._id + 'reassign' ? <span className="spinner" style={{ borderTopColor: '#dc2626' }} /> : '🔄 Reassign'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Task Detail / Edit Modal */}
            {selectedTask && (
                <TaskModal
                    task={selectedTask}
                    isAdmin={isAdmin}
                    onClose={() => setSelectedTask(null)}
                    onSaved={handleTaskSaved}
                />
            )}

            {/* Assign Developer Modal */}
            {assignTask && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAssignTask(null); }}>
                    <div className="modal" style={{ maxWidth: 580 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Assign Developer</div>
                                <div className="modal-subtitle">Task: <strong>{assignTask.task?.title}</strong> · Skills: {assignTask.task?.skills?.join(', ') || 'None'}</div>
                            </div>
                            <button className="modal-close" onClick={() => setAssignTask(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            {assignTask.candidates.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">👥</div>
                                    <div>No developers found. Please add team members first.</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                                    {assignTask.candidates.map((c, i) => (
                                        <div key={c._id} style={{
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            padding: '12px 14px',
                                            background: i === 0 ? '#f0fdf4' : '#fafafa',
                                            border: `1px solid ${i === 0 ? '#bbf7d0' : 'var(--border)'}`,
                                            borderRadius: 10,
                                            opacity: c.isBusy ? 0.6 : 1,
                                        }}>
                                            {/* Rank */}
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                                background: i === 0 ? '#059669' : i === 1 ? '#2563eb' : '#6b7280',
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.72rem', fontWeight: 800,
                                            }}>#{i + 1}</div>

                                            {/* Avatar */}
                                            <div style={{
                                                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                                background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.85rem', fontWeight: 700,
                                            }}>{c.name.charAt(0).toUpperCase()}</div>

                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.name}</span>
                                                    {i === 0 && <span className="badge badge-done" style={{ fontSize: '0.62rem' }}>Best Match</span>}
                                                    {c.isBusy && <span className="badge badge-high" style={{ fontSize: '0.62rem' }}>Busy</span>}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{c.email}</div>
                                                <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    <span>🎯 Match: <strong style={{ color: c.matchPct >= 70 ? '#059669' : c.matchPct >= 40 ? '#d97706' : '#dc2626' }}>{c.matchPct}%</strong></span>
                                                    <span>⭐ Score: <strong style={{ color: '#2563eb' }}>{c.avgScore}</strong></span>
                                                    <span>✅ Done: <strong>{c.totalTasksCompleted}</strong></span>
                                                </div>
                                                {c.matchedSkills.length > 0 && (
                                                    <div className="skills-wrap" style={{ marginTop: 5 }}>
                                                        {c.matchedSkills.map((s: string) => (
                                                            <span key={s} className="skill-tag" style={{ background: '#f0fdf4', color: '#059669', borderColor: '#bbf7d0' }}>{s}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Assign btn */}
                                            <button
                                                className="btn btn-primary btn-sm"
                                                disabled={!!actionLoading}
                                                onClick={() => doConfirmAssign(c._id, c.source)}
                                                style={{ flexShrink: 0 }}
                                            >
                                                {actionLoading === assignTask.taskId + 'assigning' ? <span className="spinner" /> : 'Assign'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reassign Modal (stale tasks) ── */}
            {reassignTarget && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setReassignTarget(null); }}>
                    <div className="modal" style={{ maxWidth: 580 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">🔄 Reassign Task</div>
                                <div className="modal-subtitle">Task: <strong>{reassignTarget.task?.title}</strong> · Select new developer</div>
                            </div>
                            <button className="modal-close" onClick={() => setReassignTarget(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.82rem', color: '#dc2626', marginBottom: 4 }}>
                                ⚠️ Currently assigned to <strong>{reassignTarget.task?.assignedTo?.name}</strong> — not started for 2+ days.
                            </div>
                            {reassignTarget.candidates.length === 0 ? (
                                <div className="empty-state"><div className="empty-icon">👥</div><div>No developers found.</div></div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                                    {reassignTarget.candidates.map((c, i) => (
                                        <div key={c._id} style={{
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            padding: '12px 14px',
                                            background: i === 0 ? '#f0fdf4' : '#fafafa',
                                            border: `1px solid ${i === 0 ? '#bbf7d0' : 'var(--border)'}`,
                                            borderRadius: 10, opacity: c.isBusy ? 0.6 : 1,
                                        }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                                background: i === 0 ? '#059669' : i === 1 ? '#2563eb' : '#6b7280',
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.72rem', fontWeight: 800,
                                            }}>#{i + 1}</div>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                                background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.85rem', fontWeight: 700,
                                            }}>{c.name.charAt(0).toUpperCase()}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.name}</span>
                                                    {i === 0 && <span className="badge badge-done" style={{ fontSize: '0.62rem' }}>Best Match</span>}
                                                    {c.isBusy && <span className="badge badge-high" style={{ fontSize: '0.62rem' }}>Busy</span>}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                                                    <span>🎯 {c.matchPct}% match</span>
                                                    <span>⭐ Score: {c.avgScore}</span>
                                                    <span>✅ {c.totalTasksCompleted} done</span>
                                                </div>
                                                {c.matchedSkills.length > 0 && (
                                                    <div className="skills-wrap" style={{ marginTop: 4 }}>
                                                        {c.matchedSkills.map((s: string) => (
                                                            <span key={s} className="skill-tag" style={{ background: '#f0fdf4', color: '#059669', borderColor: '#bbf7d0' }}>{s}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                disabled={!!actionLoading}
                                                onClick={() => doConfirmReassign(c._id, c.source)}
                                                style={{ flexShrink: 0 }}
                                            >
                                                {actionLoading === reassignTarget.taskId + 'reassigning' ? <span className="spinner" /> : 'Assign'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
    );
}
