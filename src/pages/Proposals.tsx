import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

interface TechItem { name: string; rating: number; }

// Overall rating = average of all tech ratings, supports .5 precision
const calcOverallRating = (techStack: TechItem[]): number => {
    if (!techStack?.length) return 0;
    const avg = techStack.reduce((s, t) => s + t.rating, 0) / techStack.length;
    return Math.round(avg * 2) / 2; // round to nearest 0.5
};

// Renders 5 stars with half-star support using CSS clip
const StarDisplay = ({ rating, max = 5 }: { rating: number; max?: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {Array.from({ length: max }, (_, i) => {
            const full = i + 1 <= rating;
            const half = !full && i + 0.5 < rating + 0.5 && rating > i;
            return (
                <span key={i} style={{ position: 'relative', fontSize: '0.85rem', lineHeight: 1 }}>
                    <span style={{ color: '#e5e7eb' }}>★</span>
                    {(full || half) && (
                        <span style={{
                            position: 'absolute', left: 0, top: 0,
                            color: '#f59e0b',
                            width: full ? '100%' : '50%',
                            overflow: 'hidden', display: 'inline-block',
                        }}>★</span>
                    )}
                </span>
            );
        })}
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginLeft: 3 }}>{rating.toFixed(1)}</span>
    </div>
);

interface Proposal {
    _id: string;
    name: string;
    email: string;
    gender: string;
    role: string;
    avatar: string;
    techStack: TechItem[];
    status: string;
    createdAt: string;
}

const STATUS_STYLES: Record<string, { cls: string; label: string }> = {
    pending:  { cls: 'badge-medium',  label: 'Pending'  },
    hold:     { cls: 'badge-high',    label: 'On Hold'  },
    approved: { cls: 'badge-done',    label: 'Approved' },
    rejected: { cls: 'badge-critical',label: 'Rejected' },
};

export default function Proposals() {
    const [proposals, setProposals]   = useState<Proposal[]>([]);
    const [loading, setLoading]       = useState(true);
    const [actionId, setActionId]     = useState<string | null>(null);
    const [filter, setFilter]         = useState<string>('pending');

    const fetchProposals = useCallback(async () => {
        setLoading(true);
        try {
            const params = filter === 'all' ? {} : { status: filter };
            const res = await api.get('/api/auth/proposals', { params });
            setProposals(res.data);
        } catch {
            toast.error('Failed to load proposals');
        } finally { setLoading(false); }
    }, [filter]);

    useEffect(() => { fetchProposals(); }, [fetchProposals]);

    const doAction = async (id: string, action: 'approved' | 'rejected' | 'hold') => {
        setActionId(id + action);
        try {
            const res = await api.put(`/api/auth/proposals/${id}/action`, { action });
            toast.success(res.data.message);
            fetchProposals();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Action failed');
        } finally { setActionId(null); }
    };

    const FILTERS = [
        { value: 'pending',  label: 'Pending'  },
        { value: 'hold',     label: 'On Hold'  },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'all',      label: 'All'      },
    ];

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title">Available Proposals</h1>
                    <p className="page-subtitle">Review and manage developer signup requests</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {FILTERS.map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-outline'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="loading-text">Loading proposals...</div>
            ) : proposals.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.3 }}>📋</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No proposals found</div>
                    <div style={{ fontSize: '0.855rem', color: 'var(--text-muted)' }}>
                        {filter === 'pending' ? 'No pending developer requests at the moment' : `No ${filter} proposals`}
                    </div>
                </div>
            ) : (
                <div className="proposals-grid">
                    {proposals.map(p => {
                        const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                        const statusStyle = STATUS_STYLES[p.status] || STATUS_STYLES.pending;
                        const isActing = actionId?.startsWith(p._id);

                        return (
                            <div className="proposal-card" key={p._id}>
                                {/* Card Top */}
                                <div className="proposal-card-top">
                                    {/* Avatar */}
                                    <div className="proposal-avatar-wrap">
                                        {p.avatar
                                            ? <img src={`http://localhost:5000${p.avatar}`} alt={p.name} className="proposal-avatar-img" />
                                            : <div className="proposal-avatar-initials">{initials}</div>
                                        }
                                        <div className={`proposal-status-dot proposal-dot-${p.status}`} />
                                    </div>

                                    {/* Info */}
                                    <div className="proposal-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                            <span className="proposal-name">{p.name}</span>
                                            <span className={`badge ${statusStyle.cls}`}>{statusStyle.label}</span>
                                        </div>
                                        <div className="proposal-email">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                            {p.email}
                                        </div>
                                        <div className="proposal-meta">
                                            <span className="proposal-meta-item">
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                                {p.gender.charAt(0).toUpperCase() + p.gender.slice(1)}
                                            </span>
                                            <span className="proposal-meta-item">
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                                {new Date(p.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Tech Stack */}
                                {p.techStack && p.techStack.length > 0 && (
                                    <div className="proposal-tech-section">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div className="proposal-section-label" style={{ marginBottom: 0 }}>Tech Stack</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall</span>
                                                <StarDisplay rating={calcOverallRating(p.techStack)} />
                                            </div>
                                        </div>
                                        <div className="proposal-tech-list">
                                            {p.techStack.map(t => (
                                                <div key={t.name} className="proposal-tech-item">
                                                    <span className="proposal-tech-name">{t.name}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <div className="proposal-stars">
                                                            {[1,2,3,4,5].map(s => (
                                                                <span key={s} style={{ color: s <= t.rating ? '#f59e0b' : '#e5e7eb', fontSize: '0.75rem' }}>★</span>
                                                            ))}
                                                        </div>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', minWidth: 20 }}>{t.rating}.0</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                {p.status !== 'approved' && p.status !== 'rejected' && (
                                    <div className="proposal-actions">
                                        <button
                                            className="proposal-btn proposal-btn-approve"
                                            disabled={!!isActing}
                                            onClick={() => doAction(p._id, 'approved')}
                                        >
                                            {actionId === p._id + 'approved'
                                                ? <span className="spinner" style={{ borderTopColor: '#059669' }} />
                                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                            }
                                            Approve
                                        </button>
                                        <button
                                            className="proposal-btn proposal-btn-hold"
                                            disabled={!!isActing}
                                            onClick={() => doAction(p._id, 'hold')}
                                        >
                                            {actionId === p._id + 'hold'
                                                ? <span className="spinner" style={{ borderTopColor: '#d97706' }} />
                                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                            }
                                            Hold
                                        </button>
                                        <button
                                            className="proposal-btn proposal-btn-reject"
                                            disabled={!!isActing}
                                            onClick={() => doAction(p._id, 'rejected')}
                                        >
                                            {actionId === p._id + 'rejected'
                                                ? <span className="spinner" style={{ borderTopColor: '#dc2626' }} />
                                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                            }
                                            Reject
                                        </button>
                                    </div>
                                )}

                                {/* Already actioned state */}
                                {(p.status === 'approved' || p.status === 'rejected') && (
                                    <div className={`proposal-actioned ${p.status === 'approved' ? 'proposal-actioned-approved' : 'proposal-actioned-rejected'}`}>
                                        {p.status === 'approved' ? '✅ Approved — User can now log in' : '❌ Rejected — User has been notified'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
