import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import jsPDF from 'jspdf';

// ── Types ─────────────────────────────────────────────────────────────────────
interface EstimationMeta {
    matchedTask: string | null;
    source: 'baseline_exact' | 'baseline_fuzzy' | 'project_history' | 'analytics_history' | 'ai_estimate';
    similarity: number;
    reason: string;
    originalAiHours: number;
    estimatedHours?: number;
}

interface Task {
    _id: string; title: string; description: string;
    status: string; priority: string; skills: string[];
    estimatedHours: number; actualHours: number | null;
    totalWorkedSeconds: number;
    sessionStart: string | null;
    deadline: string | null;
    assignedTo: { _id: string; name: string } | null;
    project?: { _id: string; title: string };
    estimationMeta?: EstimationMeta | null;
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

// Format hours: agar < 1 hour toh minutes dikhao, warna hours
const fmtHours = (h: number): string => {
    if (!h || h <= 0) return '0 mins';
    if (h < 1) return `${Math.round(h * 60)} mins`;
    return `${h}h`;
};

interface PlanResult {
    totalProjectHours: number;
    totalDevelopers: number;
    hoursPerDeveloper: number;
    dailyWorkingHours: number;
    totalDays: number;
    projectStartDate: string;
    previousEndDate: string;
    newStartDate: string;
    newEndDate: string;
    delayDays: number;
    devBreakdown: { developerId: string; name: string; profileScore: number; tasksAssigned: number; hoursAssigned: number; daysNeeded: number }[];
    summary: string;
}

interface AssignResult {
    assigned: { taskId: string; title: string; assignedTo: { _id: string; name: string }; matchPct: number; skillScore: number; profileScore: number }[];
    needsManual: { taskId: string; title: string; skills: string[]; reason: string; topCandidates: { _id: string; name: string; matchPct: number; profileScore: number }[] }[];
    message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const EST_SOURCE_LABEL: Record<string, string> = {
    baseline_exact:    '🎯 Exact Baseline',
    baseline_fuzzy:    '📊 Fuzzy Baseline',
    project_history:   '📁 Project History',
    analytics_history: '🌐 Global History',
    ai_estimate:       '🤖 AI Estimate',
};
const EST_SOURCE_COLOR: Record<string, string> = {
    baseline_exact:    '#059669',
    baseline_fuzzy:    '#0891b2',
    project_history:   '#7c3aed',
    analytics_history: '#d97706',
    ai_estimate:       '#6b7280',
};

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
    const [pdfLoading, setPdfLoading] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    const [autoAssigning, setAutoAssigning] = useState(false);
    const [assignResult,   setAssignResult]  = useState<AssignResult | null>(null);
    const [manualTask,     setManualTask]    = useState<AssignResult['needsManual'][0] | null>(null);
    const [manualAssigning, setManualAssigning] = useState(false);

    // Plan Project state
    const [showPlanForm,  setShowPlanForm]  = useState(false);
    const [planLoading,   setPlanLoading]   = useState(false);
    const [planResult,    setPlanResult]    = useState<PlanResult | null>(null);
    const [planForm,      setPlanForm]      = useState({ dailyWorkingHours: 8, actualStartDelayDays: 0 });

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

    const handlePlan = async () => {
        if (!id) return;
        setPlanLoading(true);
        try {
            const res = await api.post(`/api/projects/${id}/plan`, planForm);
            setPlanResult(res.data);
            setShowPlanForm(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Planning failed');
        } finally {
            setPlanLoading(false);
        }
    };

    const handleAutoAssign = async () => {
        if (!id) return;
        setAutoAssigning(true);
        try {
            const res = await api.post(`/api/projects/${id}/auto-assign`);
            setAssignResult(res.data);
            toast.success(res.data.message);
            fetchAll();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Auto-assign failed');
        } finally {
            setAutoAssigning(false);
        }
    };

    const handleManualAssign = async (taskId: string, devId: string) => {
        setManualAssigning(true);
        try {
            await api.post(`/api/tasks/${taskId}/assign-manual`, { userId: devId, source: 'auth' });
            toast.success('Task assigned!');
            setManualTask(null);
            // refresh assign result
            const res = await api.post(`/api/projects/${id}/auto-assign`);
            setAssignResult(res.data);
            fetchAll();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Assign failed');
        } finally {
            setManualAssigning(false);
        }
    };

    const downloadPDF = () => {
        if (!project) return;
        setPdfLoading(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const W = 210;
            const margin = 18;
            const contentW = W - margin * 2;

            const sortedTasks = [...project.tasks].sort((a, b) => {
                const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
            });

            // ── PAGE 1: SUMMARY ──────────────────────────────────────────────
            // Header bar
            doc.setFillColor(37, 99, 235);
            doc.rect(0, 0, W, 28, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text(project.title, margin, 17);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, W - margin, 17, { align: 'right' });

            let y = 38;

            // Project meta
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Project Overview', margin, y); y += 7;

            doc.setDrawColor(220, 220, 220);
            doc.line(margin, y, W - margin, y); y += 5;

            const meta: [string, string][] = [
                ['Status', project.status.toUpperCase()],
                ['Priority', project.priority?.toUpperCase() || '—'],
                ['Created', new Date(project.createdAt).toLocaleDateString()],
                ['Start Date', project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'],
                ['End Date', project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'],
                ['Total Tasks', String(project.tasks.length)],
                ['Done', String(project.tasks.filter(t => t.status === 'done').length)],
                ['In Progress', String(project.tasks.filter(t => t.status === 'in-progress').length)],
                ['Pending', String(project.tasks.filter(t => t.status === 'pending').length)],
                ['Est. Hours', fmtHours(project.tasks.reduce((s, t) => s + t.estimatedHours, 0))],
            ];

            doc.setFontSize(9);
            meta.forEach(([label, val], i) => {
                const col = i % 2 === 0 ? margin : margin + contentW / 2;
                if (i % 2 === 0 && i > 0) y += 7;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 100, 100);
                doc.text(label + ':', col, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 30, 30);
                doc.text(val, col + 28, y);
            });
            y += 12;

            // Description
            if (project.description) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(30, 30, 30);
                doc.text('Description', margin, y); y += 6;
                doc.setDrawColor(220, 220, 220);
                doc.line(margin, y, W - margin, y); y += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(60, 60, 60);
                const descLines = doc.splitTextToSize(project.description, contentW);
                doc.text(descLines, margin, y);
                y += descLines.length * 5 + 8;
            }

            // Task summary table
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 30, 30);
            doc.text('Tasks Summary', margin, y); y += 6;
            doc.setDrawColor(220, 220, 220);
            doc.line(margin, y, W - margin, y); y += 5;

            // Table header
            doc.setFillColor(243, 244, 246);
            doc.rect(margin, y - 3, contentW, 8, 'F');
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text('#', margin + 2, y + 2);
            doc.text('Task Title', margin + 10, y + 2);
            doc.text('Priority', margin + 100, y + 2);
            doc.text('Status', margin + 125, y + 2);
            doc.text('Est.', margin + 152, y + 2);
            doc.text('Assigned To', margin + 163, y + 2);
            y += 8;

            sortedTasks.forEach((task, idx) => {
                if (y > 270) { doc.addPage(); y = 20; }
                const rowBg = idx % 2 === 0;
                if (rowBg) { doc.setFillColor(250, 250, 252); doc.rect(margin, y - 3, contentW, 7, 'F'); }
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(37, 99, 235);
                doc.text(String(idx + 1), margin + 2, y + 1);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(30, 30, 30);
                const titleTrunc = task.title.length > 52 ? task.title.slice(0, 52) + '…' : task.title;
                doc.text(titleTrunc, margin + 10, y + 1);
                const prioColors: Record<string, [number,number,number]> = {
                    critical: [220,38,38], high: [234,88,12], medium: [202,138,4], low: [22,163,74]
                };
                const pc = prioColors[task.priority] || [100,100,100];
                doc.setTextColor(...pc);
                doc.setFont('helvetica', 'bold');
                doc.text(task.priority, margin + 100, y + 1);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(60, 60, 60);
                doc.text(task.status, margin + 125, y + 1);
                doc.setTextColor(30, 30, 30);
                doc.text(fmtHours(task.estimatedHours), margin + 152, y + 1);
                doc.text(task.assignedTo?.name || 'Unassigned', margin + 163, y + 1);
                y += 7;
            });

            // ── PAGE 2+: FULL TASK DETAILS ───────────────────────────────────
            doc.addPage();
            y = 20;

            // Page header
            doc.setFillColor(37, 99, 235);
            doc.rect(0, 0, W, 14, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`${project.title} — Full Task Details`, margin, 9);

            sortedTasks.forEach((task, idx) => {
                const neededSpace = 50;
                if (y + neededSpace > 280) {
                    doc.addPage();
                    y = 20;
                    doc.setFillColor(37, 99, 235);
                    doc.rect(0, 0, W, 14, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`${project.title} — Full Task Details`, margin, 9);
                    y = 20;
                }

                // Task card background
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(margin - 2, y - 2, contentW + 4, 8, 1, 1, 'FD');

                // Task number + title
                doc.setFillColor(37, 99, 235);
                doc.circle(margin + 3, y + 2, 3, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.text(String(idx + 1), margin + 3, y + 2.8, { align: 'center' });

                doc.setTextColor(15, 23, 42);
                doc.setFontSize(10.5);
                doc.setFont('helvetica', 'bold');
                doc.text(task.title, margin + 9, y + 3.5);
                y += 10;

                // Badges row
                const prioColors: Record<string, [number,number,number]> = {
                    critical: [220,38,38], high: [234,88,12], medium: [202,138,4], low: [22,163,74]
                };
                const statusColors: Record<string, [number,number,number]> = {
                    pending: [100,116,139], assigned: [37,99,235], 'in-progress': [217,119,6], done: [5,150,105]
                };
                const pc2 = prioColors[task.priority] || [100,100,100];
                const sc = statusColors[task.status] || [100,100,100];

                doc.setFillColor(pc2[0], pc2[1], pc2[2]);
                doc.roundedRect(margin, y, 22, 5, 1, 1, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.text(task.priority.toUpperCase(), margin + 11, y + 3.5, { align: 'center' });

                doc.setFillColor(sc[0], sc[1], sc[2]);
                doc.roundedRect(margin + 25, y, 28, 5, 1, 1, 'F');
                doc.text(task.status.toUpperCase(), margin + 39, y + 3.5, { align: 'center' });

                doc.setTextColor(60, 60, 60);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text(`⏱ ${fmtHours(task.estimatedHours)} estimated`, margin + 56, y + 3.5);
                if (task.assignedTo) {
                    doc.text(`👤 ${task.assignedTo.name}`, margin + 90, y + 3.5);
                }
                if (task.deadline) {
                    doc.text(`📅 Due: ${new Date(task.deadline).toLocaleDateString()}`, margin + 130, y + 3.5);
                }
                y += 9;

                // Skills
                if (task.skills.length > 0) {
                    doc.setFontSize(7.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(100, 100, 100);
                    doc.text('Skills:', margin, y + 3);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(37, 99, 235);
                    doc.text(task.skills.join('  •  '), margin + 14, y + 3);
                    y += 7;
                }

                // Description
                if (task.description) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(60, 60, 60);
                    doc.text('Description:', margin, y + 3); y += 6;

                    const lines = task.description.split('\n').filter(l => l.trim());
                    lines.forEach(line => {
                        const trimmed = line.trim();
                        const isStep = /^\d+[.):]+/.test(trimmed);
                        const wrapped = doc.splitTextToSize(
                            isStep ? trimmed.replace(/^\d+[.):]+\s*/, '') : trimmed,
                            contentW - (isStep ? 8 : 2)
                        );
                        wrapped.forEach((wl: string, wi: number) => {
                            if (y > 275) {
                                doc.addPage();
                                y = 20;
                                doc.setFillColor(37, 99, 235);
                                doc.rect(0, 0, W, 14, 'F');
                                doc.setTextColor(255, 255, 255);
                                doc.setFontSize(10);
                                doc.setFont('helvetica', 'bold');
                                doc.text(`${project.title} — Full Task Details`, margin, 9);
                                y = 20;
                            }
                            if (isStep && wi === 0) {
                                doc.setFillColor(37, 99, 235);
                                doc.circle(margin + 2, y + 1.5, 1.8, 'F');
                                doc.setTextColor(255, 255, 255);
                                doc.setFontSize(6);
                                doc.setFont('helvetica', 'bold');
                                const stepNum = trimmed.match(/^(\d+)/)?.[1] || '';
                                doc.text(stepNum, margin + 2, y + 2.2, { align: 'center' });
                                doc.setTextColor(30, 30, 30);
                                doc.setFontSize(8);
                                doc.setFont('helvetica', 'normal');
                                doc.text(wl, margin + 7, y + 2.5);
                            } else {
                                doc.setTextColor(50, 50, 50);
                                doc.setFontSize(8);
                                doc.setFont('helvetica', 'normal');
                                doc.text(wl, isStep ? margin + 7 : margin + 2, y + 2.5);
                            }
                            y += 5;
                        });
                    });
                }

                y += 8; // gap between tasks
            });

            // Page numbers
            const totalPages = doc.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${p} of ${totalPages}`, W / 2, 292, { align: 'center' });
            }

            doc.save(`${project.title.replace(/\s+/g, '_')}_Report.pdf`);
            toast.success('PDF downloaded!');
        } catch (err) {
            console.error(err);
            toast.error('Failed to generate PDF');
        } finally {
            setPdfLoading(false);
        }
    };

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
                <div style={{ display: 'flex', gap: 8 }}>
                    {isAdmin && (
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => { setShowPlanForm(true); setPlanResult(null); }}
                            style={{ borderColor: '#7c3aed', color: '#7c3aed' }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Plan Project
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            className="btn btn-success btn-sm"
                            disabled={autoAssigning}
                            onClick={handleAutoAssign}
                            style={{ background: '#059669', borderColor: '#059669', color: '#fff' }}
                        >
                            {autoAssigning ? <><span className="spinner" style={{ borderTopColor: '#fff' }} /> Assigning...</> : (
                                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Auto Assign</>
                            )}
                        </button>
                    )}
                    <button className="btn btn-outline btn-sm" disabled={pdfLoading} onClick={downloadPDF}
                        style={{ borderColor: '#2563eb', color: '#2563eb' }}>
                        {pdfLoading ? <span className="spinner" style={{ borderTopColor: '#2563eb' }} /> : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        )}
                        Download PDF
                    </button>
                    {isAdmin && (
                        <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
                            {deleting ? <span className="spinner" style={{ borderTopColor: '#dc2626' }} /> : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            )}
                            Delete Project
                        </button>
                    )}
                </div>
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
                            { icon: '⏱', label: 'Est. Hours', value: fmtHours(stats?.totalEstimatedHours ?? 0), cls: 'purple' },
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
                                    <span>{fmtHours(stats.totalActualHours)} actual / {fmtHours(stats.totalEstimatedHours)} estimated</span>
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
                                    <div key={task._id}
                                        onClick={() => setSelectedTask(task)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            padding: '14px 20px',
                                            borderBottom: idx < project.tasks.length - 1 ? '1px solid var(--border)' : 'none',
                                            cursor: 'pointer', transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                                    >
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

                                        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 110 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {task.assignedTo ? `👤 ${task.assignedTo.name}` : '⏳ Unassigned'}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 2 }}>
                                                {fmtHours(task.estimatedHours)}
                                                {task.actualHours != null && (
                                                    <span style={{ color: '#059669', marginLeft: 4 }}>/ {fmtHours(task.actualHours)} actual</span>
                                                )}
                                            </div>
                                            {task.estimationMeta && (
                                                <div style={{
                                                    marginTop: 4,
                                                    fontSize: '0.62rem',
                                                    fontWeight: 700,
                                                    color: EST_SOURCE_COLOR[task.estimationMeta.source] || '#6b7280',
                                                    background: `${EST_SOURCE_COLOR[task.estimationMeta.source]}15`,
                                                    border: `1px solid ${EST_SOURCE_COLOR[task.estimationMeta.source]}30`,
                                                    borderRadius: 100,
                                                    padding: '1px 7px',
                                                    display: 'inline-block',
                                                }}>
                                                    {EST_SOURCE_LABEL[task.estimationMeta.source]}
                                                </div>
                                            )}
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
                                            <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{fmtHours(item.estimatedHours)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ADJ. ETA</div>
                                            <div style={{ fontWeight: 700, color }}>{item.etaHours}h</div>
                                        </div>
                                        {item.actualHours != null && (
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ACTUAL</div>
                                                <div style={{ fontWeight: 700, color: '#059669' }}>{fmtHours(item.actualHours!)}</div>
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

            {/* ── Task Detail Modal ── */}
            {selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    isAdmin={isAdmin}
                    onClose={() => setSelectedTask(null)}
                    onSaved={() => { setSelectedTask(null); fetchAll(); }}
                />
            )}

            {/* ── Plan Project Form Modal ── */}
            {showPlanForm && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPlanForm(false); }}>
                    <div className="modal" style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">📅 Plan Project</div>
                                <div className="modal-subtitle">Calculate duration, work distribution & delay impact</div>
                            </div>
                            <button className="modal-close" onClick={() => setShowPlanForm(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: '0.8rem', color: '#7c3aed' }}>
                                    🧠 Auto-reads: <strong>{stats?.totalEstimatedHours ?? 0}h</strong> total · <strong>{[...new Set(project?.tasks.filter(t => t.assignedTo).map(t => t.assignedTo!._id))].length || 1}</strong> developer(s) · start: <strong>{project?.startDate ? new Date(project.startDate).toLocaleDateString() : new Date(project?.createdAt ?? '').toLocaleDateString()}</strong>
                                </div>
                                <div className="modal-row-2">
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Daily Working Hours</label>
                                        <input className="form-input" type="number" min={1} max={24} step={1}
                                            value={planForm.dailyWorkingHours}
                                            onChange={e => setPlanForm(f => ({ ...f, dailyWorkingHours: +e.target.value }))} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Start Delay (days)</label>
                                        <input className="form-input" type="number" min={0} step={1}
                                            value={planForm.actualStartDelayDays}
                                            onChange={e => setPlanForm(f => ({ ...f, actualStartDelayDays: +e.target.value }))} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="btn btn-outline" onClick={() => setShowPlanForm(false)}>Cancel</button>
                                    <button className="btn btn-primary" disabled={planLoading} onClick={handlePlan}
                                        style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                                        {planLoading ? <><span className="spinner" />Calculating...</> : '📅 Calculate Plan'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Plan Result Modal ── */}
            {planResult && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPlanResult(null); }}>
                    <div className="modal" style={{ maxWidth: 580 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">📅 Project Plan</div>
                                <div className="modal-subtitle">{project?.title}</div>
                            </div>
                            <button className="modal-close" onClick={() => setPlanResult(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* Summary banner */}
                            <div style={{ padding: '12px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, fontSize: '0.82rem', color: '#5b21b6', lineHeight: 1.6 }}>
                                🧠 {planResult.summary}
                            </div>

                            {/* Key metrics grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                {[
                                    { label: 'Total Hours',    value: `${planResult.totalProjectHours}h`,    color: '#2563eb' },
                                    { label: 'Developers',     value: planResult.totalDevelopers,             color: '#7c3aed' },
                                    { label: 'Hours / Dev',    value: `${planResult.hoursPerDeveloper}h`,    color: '#0891b2' },
                                    { label: 'Working Hrs/Day',value: `${planResult.dailyWorkingHours}h`,    color: '#059669' },
                                    { label: 'Total Days',     value: planResult.totalDays,                   color: '#d97706' },
                                    { label: 'Delay Days',     value: planResult.delayDays,                   color: planResult.delayDays > 0 ? '#dc2626' : '#059669' },
                                ].map(m => (
                                    <div key={m.label} style={{
                                        padding: '10px 12px', borderRadius: 8, textAlign: 'center',
                                        background: `${m.color}10`, border: `1px solid ${m.color}25`,
                                    }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: m.color }}>{m.value}</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{m.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Timeline */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timeline</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>🟢 Original Start</span>
                                        <strong>{new Date(planResult.projectStartDate).toLocaleDateString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>🏁 Expected End (no delay)</span>
                                        <strong>{new Date(planResult.previousEndDate).toLocaleDateString()}</strong>
                                    </div>
                                    {planResult.delayDays > 0 && (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                                                <span style={{ color: '#dc2626' }}>⚠️ Delayed Start (+{planResult.delayDays} days)</span>
                                                <strong style={{ color: '#dc2626' }}>{new Date(planResult.newStartDate).toLocaleDateString()}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                                                <span style={{ color: '#dc2626' }}>🔴 New End Date (with delay)</span>
                                                <strong style={{ color: '#dc2626' }}>{new Date(planResult.newEndDate).toLocaleDateString()}</strong>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Developer breakdown */}
                            {planResult.devBreakdown.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Developer Workload</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {planResult.devBreakdown.map(dev => (
                                            <div key={dev.developerId} style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 14px', borderRadius: 8,
                                                background: 'var(--bg-app)', border: '1px solid var(--border)',
                                            }}>
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                    background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.78rem', fontWeight: 700,
                                                }}>{dev.name.charAt(0).toUpperCase()}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.855rem' }}>{dev.name}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                                                        <span>📋 {dev.tasksAssigned} tasks</span>
                                                        <span>⏱ {dev.hoursAssigned}h</span>
                                                        <span>📅 {dev.daysNeeded} day(s)</span>
                                                        <span>⭐ Score: {dev.profileScore}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button className="btn btn-outline" style={{ alignSelf: 'flex-end' }}
                                onClick={() => { setPlanResult(null); setShowPlanForm(true); }}>
                                ↺ Recalculate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Auto Assign Result Modal ── */}
            {assignResult && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAssignResult(null); }}>
                    <div className="modal" style={{ maxWidth: 620 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">🤖 Auto Assign Results</div>
                                <div className="modal-subtitle">{assignResult.message}</div>
                            </div>
                            <button className="modal-close" onClick={() => setAssignResult(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

                            {/* Assigned tasks */}
                            {assignResult.assigned.length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                        ✅ Auto Assigned ({assignResult.assigned.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {assignResult.assigned.map(a => (
                                            <div key={a.taskId} style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 14px', borderRadius: 8,
                                                background: '#f0fdf4', border: '1px solid #bbf7d0',
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.855rem', marginBottom: 2 }}>{a.title}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                                                        <span>👤 {a.assignedTo.name}</span>
                                                        <span>🎯 Match: <strong style={{ color: '#059669' }}>{a.matchPct}%</strong></span>
                                                        <span>⭐ Score: <strong style={{ color: '#2563eb' }}>{a.profileScore}</strong></span>
                                                    </div>
                                                </div>
                                                <span className="badge badge-done">Assigned</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Needs manual */}
                            {assignResult.needsManual.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                        ⚠️ Needs Manual Assignment ({assignResult.needsManual.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {assignResult.needsManual.map(t => (
                                            <div key={t.taskId} style={{
                                                padding: '10px 14px', borderRadius: 8,
                                                background: '#fef2f2', border: '1px solid #fecaca',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.855rem' }}>{t.title}</div>
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => { setManualTask(t); setAssignResult(null); }}
                                                    >
                                                        Assign Manually
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#dc2626', marginBottom: 4 }}>{t.reason}</div>
                                                <div className="skills-wrap">
                                                    {t.skills.map(s => <span key={s} className="skill-tag" style={{ fontSize: '0.62rem' }}>{s}</span>)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {assignResult.assigned.length === 0 && assignResult.needsManual.length === 0 && (
                                <div className="empty-state">
                                    <div className="empty-icon">✅</div>
                                    <div>All tasks are already assigned</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Manual Assign Modal ── */}
            {manualTask && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setManualTask(null); }}>
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">👤 Manual Assign</div>
                                <div className="modal-subtitle" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {manualTask.title}
                                </div>
                            </div>
                            <button className="modal-close" onClick={() => setManualTask(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.8rem', color: '#dc2626', marginBottom: 14 }}>
                                ⚠️ No developer has matching skills. Select any developer to assign manually.
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                                Required skills: {manualTask.skills.join(', ') || 'None'}
                            </div>
                            {manualTask.topCandidates.length === 0 ? (
                                <div className="empty-state"><div className="empty-icon">👥</div><div>No developers available</div></div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {manualTask.topCandidates.map((c, i) => (
                                        <div key={c._id} style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '10px 14px', borderRadius: 8,
                                            background: i === 0 ? '#f0fdf4' : 'var(--bg-app)',
                                            border: `1px solid ${i === 0 ? '#bbf7d0' : 'var(--border)'}`,
                                        }}>
                                            <div style={{
                                                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                                                background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.82rem', fontWeight: 700,
                                            }}>{c.name.charAt(0).toUpperCase()}</div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.855rem' }}>{c.name}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                                                    <span>🎯 Match: <strong style={{ color: c.matchPct > 0 ? '#059669' : '#dc2626' }}>{c.matchPct}%</strong></span>
                                                    <span>⭐ Score: <strong style={{ color: '#2563eb' }}>{c.profileScore}</strong></span>
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                disabled={manualAssigning}
                                                onClick={() => handleManualAssign(manualTask.taskId, c._id)}
                                            >
                                                {manualAssigning ? <span className="spinner" /> : 'Assign'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
function TaskDetailModal({ task, isAdmin, onClose, onSaved }: {
    task: Task; isAdmin: boolean;
    onClose: () => void; onSaved: () => void;
}) {
    const [editing, setEditing]     = useState(false);
    const [saving, setSaving]       = useState(false);
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
        if (s && !form.skills.includes(s)) { set('skills', [...form.skills, s]); setSkillInput(''); }
    };
    const removeSkill = (s: string) => set('skills', form.skills.filter(x => x !== s));

    const handleSave = async () => {
        if (!form.title.trim()) return toast.error('Task name is required');
        setSaving(true);
        try {
            await api.put(`/api/tasks/${task._id}`, {
                title: form.title.trim(), description: form.description.trim(),
                priority: form.priority, status: form.status,
                estimatedHours: Number(form.estimatedHours),
                skills: form.skills, deadline: form.deadline || null,
            });
            toast.success('✅ Task updated!');
            onSaved();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Update failed');
        } finally { setSaving(false); }
    };

    const PRIORITY_CLS: Record<string, string> = {
        low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
    };
    const STATUS_CLS: Record<string, string> = {
        pending: 'badge-pending', assigned: 'badge-assigned',
        'in-progress': 'badge-in-progress', done: 'badge-done',
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
                                Edit
                            </button>
                        )}
                        <button className="modal-close" onClick={onClose}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                <div className="modal-body">
                    {!editing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Title + badges */}
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 8 }}>{task.title}</div>
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
                                            const isStep = /^\d+[\.\.\):]/.test(trimmed);
                                            return (
                                                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
                                                    {isStep && (
                                                        <span style={{
                                                            flexShrink: 0, minWidth: 22, height: 22, borderRadius: '50%',
                                                            background: '#2563eb', color: '#fff',
                                                            fontSize: '0.68rem', fontWeight: 700,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                                                        }}>{trimmed.match(/^(\d+)/)?.[1]}</span>
                                                    )}
                                                    <span style={{ flex: 1 }}>{isStep ? trimmed.replace(/^\d+[\.\.\):]+\s*/, '') : trimmed}</span>
                                                </div>
                                            );
                                          }).filter(Boolean)
                                        : '—'
                                    }
                                </div>
                            </div>

                            {/* Skills */}
                            <div>
                                <div className="task-modal-label">Skills</div>
                                {task.skills.length > 0
                                    ? <div className="skills-wrap">{task.skills.map(s => <span key={s} className="skill-tag">{s}</span>)}</div>
                                    : <span style={{ fontSize: '0.855rem', color: 'var(--text-muted)' }}>No skills specified</span>
                                }
                            </div>

                            {/* Stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="task-modal-stat">
                                    <div className="task-modal-label">Estimated Hours</div>
                                    <div className="task-modal-val">{fmtHours(task.estimatedHours)}</div>
                                </div>
                                <div className="task-modal-stat">
                                    <div className="task-modal-label">Assigned To</div>
                                    <div className="task-modal-val" style={{ fontSize: '0.85rem' }}>
                                        {task.assignedTo
                                            ? <span style={{ color: '#2563eb', fontWeight: 700 }}>👤 {task.assignedTo.name}</span>
                                            : <span style={{ color: '#6b7280' }}>⏳ Pending</span>
                                        }
                                    </div>
                                </div>
                            </div>

                            {/* Estimation Intelligence Panel */}
                            {task.estimationMeta && (() => {
                                const meta = task.estimationMeta!;
                                const color = EST_SOURCE_COLOR[meta.source] || '#6b7280';
                                const label = EST_SOURCE_LABEL[meta.source];
                                const savedHours = meta.source !== 'ai_estimate'
                                    ? +(meta.originalAiHours - task.estimatedHours).toFixed(1)
                                    : 0;
                                return (
                                    <div style={{
                                        background: `${color}08`,
                                        border: `1px solid ${color}30`,
                                        borderRadius: 10,
                                        padding: '12px 14px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                🧠 Estimation Intelligence
                                            </span>
                                            <span style={{
                                                fontSize: '0.68rem', fontWeight: 700,
                                                color, background: `${color}15`,
                                                border: `1px solid ${color}30`,
                                                borderRadius: 100, padding: '2px 8px',
                                            }}>{label}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>Final Estimate</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{task.estimatedHours}h</div>
                                            </div>
                                            {meta.source !== 'ai_estimate' && (
                                                <>
                                                    <div>
                                                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>AI Suggested</div>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#9ca3af', textDecoration: 'line-through' }}>{meta.originalAiHours}h</div>
                                                    </div>
                                                    {savedHours > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>Hours Saved</div>
                                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>-{savedHours}h</div>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>Similarity</div>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{meta.similarity}%</div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        {meta.matchedTask && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Matched: </span>
                                                <span style={{ fontWeight: 600 }}>&#34;{meta.matchedTask}&#34;</span>
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                                            {meta.reason}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        /* Edit Mode */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Task Name *</label>
                                <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Description</label>
                                <textarea className="form-textarea" rows={4} value={form.description}
                                    onChange={e => set('description', e.target.value)}
                                    style={{ resize: 'vertical', minHeight: 90 }} />
                            </div>
                            <div className="modal-row-2">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Priority</label>
                                    <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
                                        {['low','medium','high','critical'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                                        {['pending','assigned','in-progress','done'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-row-2">
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Estimated Hours</label>
                                    <input className="form-input" type="number" min={0.5} step={0.5}
                                        value={form.estimatedHours} onChange={e => set('estimatedHours', e.target.value)} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Deadline</label>
                                    <input className="form-input" type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Skills</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="form-input" placeholder="e.g. React" value={skillInput}
                                        onChange={e => setSkillInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())} />
                                    <button type="button" className="btn btn-outline btn-sm" onClick={addSkill}>+ Add</button>
                                </div>
                                {form.skills.length > 0 && (
                                    <div className="skills-wrap" style={{ marginTop: 8 }}>
                                        {form.skills.map(s => (
                                            <span key={s} className="skill-tag" style={{ cursor: 'pointer' }} onClick={() => removeSkill(s)}>
                                                {s} <span style={{ marginLeft: 3, opacity: 0.6 }}>×</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
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
