import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

interface TimelineItem {
    taskId: string;
    title: string;
    priority: string;
    status: string;
    skills: string[];
    estimatedHours: number;
    etaHours: number;
    assignedTo: { id: string; name: string } | null;
    startTime: string | null;
    endTime: string | null;
    actualHours: number | null;
    scheduledStart: string;
    scheduledEnd: string;
}

const STATUS_COLORS: Record<string, string> = {
    pending:      '#64748b',
    assigned:     '#3b82f6',
    'in-progress':'#f59e0b',
    done:         '#10b981',
};

const PRIORITY_CLS: Record<string, string> = {
    low: 'badge-low', medium: 'badge-medium', high: 'badge-high', critical: 'badge-critical',
};

// Format a date as "Jan 15"
const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtHours = (h: number): string => {
    if (!h || h <= 0) return '0 mins';
    if (h < 1) return `${Math.round(h * 60)} mins`;
    return `${h}h`;
};

// Format a date as "Jan 15, 10:30 AM"
const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

// Duration label
const durationLabel = (startIso: string, endIso: string) => {
    const h = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3600000;
    if (h < 24) return `${Math.round(h * 10) / 10}h`;
    const d = h / 8; // 8h working day
    return `${Math.round(d * 10) / 10}d`;
};

export default function Timeline() {
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [view,     setView]     = useState<'gantt' | 'list'>('gantt');
    const [tooltip,  setTooltip]  = useState<{ item: TimelineItem; x: number; y: number } | null>(null);
    const ganttRef = useRef<HTMLDivElement>(null);

    const fetchTimeline = useCallback(async () => {
        try {
            const res = await api.get('/api/projects/all/timeline');
            setTimeline(res.data.timeline || []);
        } catch {
            toast.error('Failed to load timeline');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

    if (loading) return <div className="loading-text">Loading timeline...</div>;

    if (timeline.length === 0) {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">📅 Timeline</h1>
                    <p className="page-subtitle">Gantt-style project timeline with AI-adjusted scheduling</p>
                </div>
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-icon">📅</div>
                        <p>No tasks in the timeline yet. Upload requirements and generate tasks first.</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Compute Gantt axis bounds ─────────────────────────────────────────────
    const allStarts = timeline.map(t => new Date(t.scheduledStart).getTime());
    const allEnds   = timeline.map(t => new Date(t.scheduledEnd).getTime());
    const minMs     = Math.min(...allStarts);
    const maxMs     = Math.max(...allEnds);
    const spanMs    = maxMs - minMs || 1;

    // Build day tick marks (one per day across the span)
    const dayMs   = 24 * 60 * 60 * 1000;
    const numDays = Math.ceil(spanMs / dayMs) + 1;
    const dayTicks: Date[] = Array.from({ length: numDays }, (_, i) =>
        new Date(minMs + i * dayMs)
    );

    const pct = (ms: number) => ((ms - minMs) / spanMs) * 100;

    // Group tasks by developer for the Gantt label column
    const devOrder: string[] = [];
    const devMap = new Map<string, TimelineItem[]>();
    for (const item of timeline) {
        const key  = item.assignedTo?.name ?? '⏳ Unassigned';
        if (!devMap.has(key)) { devMap.set(key, []); devOrder.push(key); }
        devMap.get(key)!.push(item);
    }

    return (
        <div>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h1 className="page-title">📅 Timeline</h1>
                    <p className="page-subtitle">
                        Gantt-style schedule · {timeline.length} tasks · {fmtDate(new Date(minMs))} → {fmtDate(new Date(maxMs))}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['gantt', 'list'] as const).map(v => (
                        <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView(v)}>
                            {v === 'gantt' ? '📊 Gantt' : '📋 List'}
                        </button>
                    ))}
                    <button className="btn btn-outline btn-sm" onClick={fetchTimeline} title="Refresh">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                </div>
            </div>

            {/* ── Legend ── */}
            <div className="card" style={{ padding: '10px 18px', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    {Object.entries(STATUS_COLORS).map(([s, c]) => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{s}
                        </div>
                    ))}
                    <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Hover bars for details · 1 working day = 8h
                    </div>
                </div>
            </div>

            {/* ══ GANTT VIEW ══ */}
            {view === 'gantt' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 900 }}>

                            {/* Date axis header */}
                            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                                {/* Label column header */}
                                <div style={{ width: 220, flexShrink: 0, padding: '8px 16px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: '1px solid var(--border)' }}>
                                    Developer / Task
                                </div>
                                {/* Axis */}
                                <div ref={ganttRef} style={{ flex: 1, position: 'relative', height: 32 }}>
                                    {dayTicks.map((d, i) => (
                                        <div key={i} style={{
                                            position: 'absolute',
                                            left: `${pct(d.getTime())}%`,
                                            top: 0, bottom: 0,
                                            display: 'flex', alignItems: 'center',
                                            paddingLeft: 4,
                                        }}>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {fmtDate(d)}
                                            </span>
                                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                                        </div>
                                    ))}
                                    {/* Today marker */}
                                    {Date.now() >= minMs && Date.now() <= maxMs && (
                                        <div style={{
                                            position: 'absolute',
                                            left: `${pct(Date.now())}%`,
                                            top: 0, bottom: 0,
                                            width: 2, background: '#dc2626',
                                            zIndex: 10,
                                        }}>
                                            <div style={{ position: 'absolute', top: 2, left: 3, fontSize: '0.6rem', color: '#dc2626', fontWeight: 700, whiteSpace: 'nowrap' }}>TODAY</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Rows grouped by developer */}
                            {devOrder.map(devName => (
                                <div key={devName}>
                                    {/* Developer group header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        background: 'var(--bg-hover)',
                                        borderBottom: '1px solid var(--border)',
                                        padding: '6px 16px',
                                        fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)',
                                    }}>
                                        <span style={{ width: 204 }}>👤 {devName}</span>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                            {devMap.get(devName)!.length} task{devMap.get(devName)!.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {/* Task rows */}
                                    {devMap.get(devName)!.map(item => {
                                        const startPct = pct(new Date(item.scheduledStart).getTime());
                                        const endPct   = pct(new Date(item.scheduledEnd).getTime());
                                        const widthPct = Math.max(endPct - startPct, 0.5);
                                        const color    = STATUS_COLORS[item.status] || '#64748b';

                                        return (
                                            <div key={item.taskId} style={{
                                                display: 'flex', alignItems: 'center',
                                                borderBottom: '1px solid var(--border)',
                                                minHeight: 44,
                                            }}>
                                                {/* Label */}
                                                <div style={{
                                                    width: 220, flexShrink: 0,
                                                    padding: '8px 16px',
                                                    borderRight: '1px solid var(--border)',
                                                    fontSize: '0.78rem',
                                                }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.title}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <span className={`badge ${PRIORITY_CLS[item.priority]}`} style={{ fontSize: '0.6rem' }}>{item.priority}</span>
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{fmtHours(item.etaHours)}</span>
                                                    </div>
                                                </div>

                                                {/* Gantt bar area */}
                                                <div style={{ flex: 1, position: 'relative', height: 44, overflow: 'hidden' }}>
                                                    {/* Day grid lines */}
                                                    {dayTicks.map((d, i) => (
                                                        <div key={i} style={{
                                                            position: 'absolute', left: `${pct(d.getTime())}%`,
                                                            top: 0, bottom: 0, width: 1,
                                                            background: 'var(--border)', opacity: 0.5,
                                                        }} />
                                                    ))}

                                                    {/* Today line */}
                                                    {Date.now() >= minMs && Date.now() <= maxMs && (
                                                        <div style={{
                                                            position: 'absolute', left: `${pct(Date.now())}%`,
                                                            top: 0, bottom: 0, width: 2,
                                                            background: '#dc262640', zIndex: 5,
                                                        }} />
                                                    )}

                                                    {/* The bar */}
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${startPct}%`,
                                                            width: `${widthPct}%`,
                                                            top: '50%', transform: 'translateY(-50%)',
                                                            height: 22,
                                                            background: color,
                                                            borderRadius: 4,
                                                            opacity: item.status === 'done' ? 0.75 : 1,
                                                            cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center',
                                                            paddingLeft: 6, overflow: 'hidden',
                                                            zIndex: 6,
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                                            transition: 'opacity 0.15s',
                                                        }}
                                                        onMouseEnter={e => {
                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            setTooltip({ item, x: rect.left, y: rect.top });
                                                        }}
                                                        onMouseLeave={() => setTooltip(null)}
                                                    >
                                                        <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.status === 'done' ? '✅ ' : item.status === 'in-progress' ? '⚡ ' : ''}{durationLabel(item.scheduledStart, item.scheduledEnd)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ══ LIST VIEW ══ */}
            {view === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {timeline.map(item => {
                        const color = STATUS_COLORS[item.status] || '#64748b';
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
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>SCHEDULED START</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{fmtDateTime(item.scheduledStart)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>PROJECTED END</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem', color }}>{fmtDateTime(item.scheduledEnd)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>DURATION</div>
                                            <div style={{ fontWeight: 700, color }}>{durationLabel(item.scheduledStart, item.scheduledEnd)}</div>
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
                                {/* Progress bar showing position in schedule */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="timeline-bar-container">
                                        <div className="timeline-bar" style={{
                                            width: `${Math.min(((new Date(item.scheduledEnd).getTime() - minMs) / spanMs) * 100, 100)}%`,
                                            background: color,
                                        }} />
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

            {/* ── Tooltip ── */}
            {tooltip && (
                <div style={{
                    position: 'fixed',
                    left: tooltip.x + 10,
                    top: tooltip.y - 80,
                    background: '#1a1d23',
                    color: '#f1f5f9',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    maxWidth: 260,
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{tooltip.item.title}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, color: '#94a3b8' }}>
                        <span>🗓 Start: <strong style={{ color: '#f1f5f9' }}>{fmtDateTime(tooltip.item.scheduledStart)}</strong></span>
                        <span>🏁 End: <strong style={{ color: '#f1f5f9' }}>{fmtDateTime(tooltip.item.scheduledEnd)}</strong></span>
                        <span>⏱ ETA: <strong style={{ color: '#f1f5f9' }}>{fmtHours(tooltip.item.etaHours)}</strong> (est: {fmtHours(tooltip.item.estimatedHours)})</span>
                        {tooltip.item.actualHours != null && (
                            <span>✅ Actual: <strong style={{ color: '#34d399' }}>{fmtHours(tooltip.item.actualHours)}</strong></span>
                        )}
                        <span>👤 {tooltip.item.assignedTo?.name ?? 'Unassigned'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
