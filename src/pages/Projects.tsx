import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';

interface Project {
    _id: string;
    title: string;
    description: string;
    status: string;
    priority?: string;
    startDate?: string;
    endDate?: string;
    tasks: any[];
    requirements: any[];
    createdAt: string;
}

interface User { _id: string; name: string; source?: 'legacy' | 'auth'; }

const STATUS_COLORS: Record<string, string> = {
    planning: 'badge-planning',
    active: 'badge-assigned',
    'on-hold': 'badge-high',
    completed: 'badge-done',
    cancelled: 'badge-pending',
};

const PRIORITY_COLORS: Record<string, string> = {
    low: 'badge-low', medium: 'badge-medium', high: 'badge-high',
};

const PROJECT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];

const ALL_TECHS = [
    'React','Next.js','Vue','Angular','HTML','CSS','Tailwind','TypeScript','JavaScript',
    'Node.js','Express','Django','Laravel','Spring Boot','Python','PHP','Java','C#',
    'MongoDB','MySQL','PostgreSQL','SQL Server','Redis',
    'Docker','AWS','Git','Redux','GraphQL','REST API','React Native','Flutter',
];

export default function Projects() {
    const navigate = useNavigate();
    const location = useLocation();
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const fileRef = useRef<HTMLInputElement>(null);
    const [techSearch, setTechSearch] = useState('');
    const [showTechDrop, setShowTechDrop] = useState(false);

    const [form, setForm] = useState({
        title: '', description: '',
        status: 'planning', priority: 'medium',
        startDate: '', endDate: '',
        team: [] as string[],
        techStack: [] as string[],
    });
    const [file, setFile] = useState<File | null>(null);

    const fetchAll = useCallback(async () => {
        try {
            const [pRes, uRes, authRes] = await Promise.all([
                api.get('/api/projects'),
                api.get('/api/users'),
                api.get('/api/auth/developers?status=approved'),
            ]);
            setProjects(pRes.data);
            const legacyUsers: User[] = uRes.data.map((u: User) => ({ ...u, source: 'legacy' }));
            const authUsers: User[]   = authRes.data
                .filter((u: any) => u.role === 'developer')
                .map((u: any) => ({ _id: u._id, name: u.name, source: 'auth' }));
            const seen = new Set(authUsers.map(u => u._id));
            setUsers([...authUsers, ...legacyUsers.filter(u => !seen.has(u._id))]);
        } catch { toast.error('Failed to load projects'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Auto-open modal when navigated here with ?new=1 (e.g. from Dashboard)
    useEffect(() => {
        if (new URLSearchParams(location.search).get('new') === '1') {
            setShowModal(true);
            navigate('/projects', { replace: true });
        }
    }, [location.search, navigate]);

    const resetForm = () => {
        setForm({ title: '', description: '', status: 'planning', priority: 'medium', startDate: '', endDate: '', team: [], techStack: [] });
        setFile(null);
        setTechSearch('');
        setShowTechDrop(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const addTech = (t: string) => {
        if (!form.techStack.includes(t)) setForm(f => ({ ...f, techStack: [...f.techStack, t] }));
        setTechSearch(''); setShowTechDrop(false);
    };
    const removeTech = (t: string) => setForm(f => ({ ...f, techStack: f.techStack.filter(x => x !== t) }));

    const filteredTechs = ALL_TECHS.filter(t =>
        t.toLowerCase().includes(techSearch.toLowerCase()) && !form.techStack.includes(t)
    );

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) return toast.error('Project name is required');
        setCreating(true);
        try {
            // 1. Create project
            const projRes = await api.post('/api/projects', {
                title: form.title.trim(),
                description: form.description.trim(),
                status: form.status,
                priority: form.priority,
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
            });
            const project = projRes.data;
            toast.success(`✅ Project "${project.title}" created!`);

            // 2. Upload file if provided — prepend description + tech stack as context
            let requirementId: string | null = null;
            if (file) {
                const fd = new FormData();
                // Inject description + tech stack as a text prefix so AI has full context
                const contextBlob = new Blob([
                    `PROJECT: ${form.title}\nDESCRIPTION: ${form.description}\nTECH STACK: ${form.techStack.join(', ')}\n\n---\n\n`
                ], { type: 'text/plain' });
                const contextFile = new File([contextBlob], 'context.txt', { type: 'text/plain' });
                // Upload context first
                const ctxFd = new FormData();
                ctxFd.append('file', contextFile);
                try {
                    const ctxRes = await api.post(`/api/projects/${project._id}/upload`, ctxFd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    requirementId = ctxRes.data.requirementId;
                } catch { /* ignore context upload failure */ }
                // Upload actual file
                fd.append('file', file);
                try {
                    const upRes = await api.post(`/api/projects/${project._id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    requirementId = upRes.data.requirementId;
                    toast.success('📄 File uploaded!');
                } catch (err: any) {
                    toast.error(err.response?.data?.error || 'File upload failed');
                }
            } else if (form.description || form.techStack.length > 0) {
                // No file — use description + tech stack as the requirement
                const textContent = `PROJECT: ${form.title}\nDESCRIPTION: ${form.description}\nTECH STACK: ${form.techStack.join(', ')}`;
                const blob = new Blob([textContent], { type: 'text/plain' });
                const textFile = new File([blob], 'requirements.txt', { type: 'text/plain' });
                const fd = new FormData();
                fd.append('file', textFile);
                try {
                    const upRes = await api.post(`/api/projects/${project._id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    requirementId = upRes.data.requirementId;
                } catch { /* ignore */ }
            }

            // 3. Generate AI tasks if file was uploaded
            if (requirementId) {
                toast.loading('🤖 AI is generating tasks...', { id: 'ai-gen' });
                try {
                    const genRes = await api.post(`/api/projects/${project._id}/generate-tasks/${requirementId}`);
                    toast.success(genRes.data.message, { id: 'ai-gen' });
                } catch (err: any) {
                    toast.error(err.response?.data?.error || 'AI task generation failed', { id: 'ai-gen' });
                }
            }

            setShowModal(false);
            resetForm();
            fetchAll();
            if (requirementId) navigate('/tasks');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to create project');
        } finally {
            setCreating(false);
        }
    };

    const toggleTeam = (id: string) => {
        setForm(f => ({
            ...f,
            team: f.team.includes(id) ? f.team.filter(x => x !== id) : [...f.team, id],
        }));
    };

    const filtered = projects.filter(p => {
        const matchSearch = p.title.toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === 'all' || p.status === filterStatus;
        const matchPriority = filterPriority === 'all' || (p as any).priority === filterPriority;
        return matchSearch && matchStatus && matchPriority;
    });

    const getProgress = (p: Project) => {
        if (!p.tasks?.length) return 0;
        const done = p.tasks.filter((t: any) => t.status === 'done').length;
        return Math.round((done / p.tasks.length) * 100);
    };

    if (loading) return <div className="loading-text">Loading projects...</div>;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title">Projects</h1>
                    <p className="page-subtitle">Manage and track all your projects</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Project
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="form-select" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select className="form-select" style={{ width: 140 }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                    <option value="all">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </div>

            {/* Project Cards Grid */}
            {filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.3 }}>📁</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No projects found</div>
                    <div style={{ fontSize: '0.855rem', color: 'var(--text-muted)', marginBottom: 20 }}>Create your first project to get started</div>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Project</button>
                </div>
            ) : (
                <div className="projects-grid">
                    {filtered.map((proj, i) => {
                        const progress = getProgress(proj);
                        const color = PROJECT_COLORS[i % PROJECT_COLORS.length];
                        return (
                            <div className="project-card" key={proj._id} onClick={() => navigate(`/projects/${proj._id}`)}>
                                <div className="project-card-top" style={{ borderTopColor: color }} />
                                <div className="project-card-body">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <div className="project-card-icon" style={{ background: color + '18', color }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <span className={`badge ${STATUS_COLORS[proj.status] || 'badge-pending'}`}>{proj.status}</span>
                                            {(proj as any).priority && <span className={`badge ${PRIORITY_COLORS[(proj as any).priority] || 'badge-medium'}`}>{(proj as any).priority}</span>}
                                        </div>
                                    </div>

                                    <div className="project-card-name">{proj.title}</div>
                                    <div className="project-card-desc">{proj.description || 'No description provided'}</div>

                                    <div className="project-card-meta">
                                        <span>🗂 {proj.tasks?.length ?? 0} tasks</span>
                                        <span>📄 {proj.requirements?.length ?? 0} files</span>
                                        <span>📅 {new Date(proj.createdAt).toLocaleDateString()}</span>
                                    </div>

                                    <div style={{ marginTop: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>PROGRESS</span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{progress}%</span>
                                        </div>
                                        <div className="progress-bar-bg">
                                            <div className="progress-bar-fill" style={{ width: `${progress}%`, background: color }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Create Project Modal ── */}
            {showModal && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}>
                    <div className="modal">
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Create New Project</div>
                                <div className="modal-subtitle">Fill in the details to create and generate AI tasks</div>
                            </div>
                            <button className="modal-close" onClick={() => { setShowModal(false); resetForm(); }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="modal-body">
                            {/* Name + Description */}
                            <div className="modal-row-2">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Project Name *</label>
                                    <input className="form-input" placeholder="e.g. SOLVEVARE" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Description</label>
                                    <input className="form-input" placeholder="Brief project description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                                </div>
                            </div>

                            {/* File Upload */}
                            <div className="form-group">
                                <label className="form-label">Upload Requirements File</label>
                                <div className="modal-upload-area" onClick={() => fileRef.current?.click()}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-light)', marginBottom: 6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                    {file ? (
                                        <div style={{ fontSize: '0.82rem', color: 'var(--accent-blue)', fontWeight: 600 }}>📄 {file.name}</div>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Click to upload or drag & drop</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: 2 }}>PDF, DOCX, TXT, MD, PNG, JPG, ZIP, RAR, XLSX, XLS (max 10MB)</div>
                                        </>
                                    )}
                                    <input ref={fileRef} type="file" style={{ display: 'none' }}
                                        accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.zip,.rar,.xlsx,.xls,.csv"
                                        onChange={e => setFile(e.target.files?.[0] || null)} />
                                </div>
                                {file && <button type="button" style={{ fontSize: '0.72rem', color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }} onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>✕ Remove file</button>}
                            </div>

                            {/* Tech Stack */}
                            <div className="form-group">
                                <label className="form-label">Project Tech Stack</label>
                                <div style={{ position: 'relative' }}>
                                    <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }}
                                        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    </svg>
                                    <input className="form-input" style={{ paddingLeft: 30 }}
                                        placeholder="Search tech stack (React, Node.js...)"
                                        value={techSearch}
                                        onChange={e => { setTechSearch(e.target.value); setShowTechDrop(true); }}
                                        onFocus={() => setShowTechDrop(true)}
                                        onBlur={() => setTimeout(() => setShowTechDrop(false), 150)}
                                    />
                                    {showTechDrop && techSearch && filteredTechs.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                            background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                                            boxShadow: 'var(--shadow)', maxHeight: 180, overflowY: 'auto', marginTop: 2,
                                        }}>
                                            {filteredTechs.map(t => (
                                                <div key={t}
                                                    style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '0.855rem', color: 'var(--text-primary)' }}
                                                    onMouseDown={() => addTech(t)}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                                    {t}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {form.techStack.length > 0 && (
                                    <div className="skills-wrap" style={{ marginTop: 8 }}>
                                        {form.techStack.map(t => (
                                            <span key={t} className="skill-tag" style={{ cursor: 'pointer' }} onClick={() => removeTech(t)}>
                                                {t} <span style={{ marginLeft: 3, opacity: 0.6 }}>×</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Status + Priority */}
                            <div className="modal-row-2">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Status</label>
                                    <div className="radio-group">
                                        {['planning', 'active', 'on-hold', 'cancelled'].map(s => (
                                            <label key={s} className={`radio-btn ${form.status === s ? 'radio-btn-active' : ''}`}>
                                                <input type="radio" name="status" value={s} checked={form.status === s} onChange={() => setForm(f => ({ ...f, status: s }))} style={{ display: 'none' }} />
                                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Priority</label>
                                    <div className="radio-group">
                                        {['low', 'medium', 'high'].map(p => (
                                            <label key={p} className={`radio-btn ${form.priority === p ? 'radio-btn-active radio-btn-' + p : ''}`}>
                                                <input type="radio" name="priority" value={p} checked={form.priority === p} onChange={() => setForm(f => ({ ...f, priority: p }))} style={{ display: 'none' }} />
                                                {p.charAt(0).toUpperCase() + p.slice(1)}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Dates */}
                            <div className="modal-row-2">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Start Date</label>
                                    <input type="date" className="form-input" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">End Date</label>
                                    <input type="date" className="form-input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                                </div>
                            </div>

                            {/* Team */}
                            {users.length > 0 && (
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Project Team</label>
                                    <div className="team-selector">
                                        {users.map(u => (
                                            <label key={u._id} className={`team-member-btn ${form.team.includes(u._id) ? 'team-member-active' : ''}`}>
                                                <input type="checkbox" style={{ display: 'none' }} checked={form.team.includes(u._id)} onChange={() => toggleTeam(u._id)} />
                                                <div className="team-member-avatar">{u.name.charAt(0).toUpperCase()}</div>
                                                <span>{u.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={creating}>
                                    {creating ? (
                                        <><span className="spinner" />Creating...</>
                                    ) : (
                                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create Project</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
