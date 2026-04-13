import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import api from './api/axios';

import Login      from './pages/Login';
import Signup     from './pages/Signup';
import Dashboard  from './pages/Dashboard';
import Projects      from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Tasks      from './pages/Tasks';
import Developers from './pages/Developers';
import Timeline   from './pages/Timeline';
import Proposals  from './pages/Proposals';
import Profile    from './pages/Profile';
import './App.css';

// ── Shared Dropdown Context ───────────────────────────────────────────────────────────────────
// Ek waqt mein sirf ek hi dropdown open rahega.
// Jab koi naya dropdown open hoga, baaki sab automatically band ho jayenge.
type DropdownId = 'search' | 'notifications' | null;

const DropdownContext = createContext<{
    openId: DropdownId;
    open:   (id: DropdownId) => void;
    close:  () => void;
}>({
    openId: null,
    open:   () => {},
    close:  () => {},
});

function DropdownProvider({ children }: { children: React.ReactNode }) {
    const [openId, setOpenId] = useState<DropdownId>(null);

    // Global click — bahar click karne par sab band
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Agar click kisi dropdown ke andar nahi hua toh band karo
            if (!target.closest('[data-dropdown]')) setOpenId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <DropdownContext.Provider value={{
            openId,
            open:  (id) => setOpenId(id),   // naya open karo (purana auto-close)
            close: ()   => setOpenId(null),
        }}>
            {children}
        </DropdownContext.Provider>
    );
}

const useDropdown = () => useContext(DropdownContext);

// ── Protected route wrapper ───────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
    const { token } = useAuth();
    const location  = useLocation();
    if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
    return <>{children}</>;
}

// ── Global Search ────────────────────────────────────────────────────────
interface SearchResult {
    id: string;
    type: 'project' | 'task';
    title: string;
    subtitle: string;
    link: string;
}

function GlobalSearch() {
    const [query,   setQuery]   = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const ref      = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { openId, open, close } = useDropdown();
    const isOpen = openId === 'search';

    const search = useCallback(async (q: string) => {
        if (!q.trim()) { setResults([]); close(); return; }
        setLoading(true);
        try {
            const [pRes, tRes] = await Promise.all([
                api.get('/api/projects'),
                api.get('/api/tasks'),
            ]);
            const lq = q.toLowerCase();

            const projectHits: SearchResult[] = pRes.data
                .filter((p: any) =>
                    p.title.toLowerCase().includes(lq) ||
                    p.description?.toLowerCase().includes(lq)
                )
                .slice(0, 4)
                .map((p: any) => ({
                    id: p._id, type: 'project' as const,
                    title: p.title,
                    subtitle: `Project · ${p.status} · ${p.tasks?.length ?? 0} tasks`,
                    link: `/projects/${p._id}`,
                }));

            const taskHits: SearchResult[] = tRes.data
                .filter((t: any) =>
                    t.title.toLowerCase().includes(lq) ||
                    t.description?.toLowerCase().includes(lq) ||
                    t.skills?.some((s: string) => s.toLowerCase().includes(lq))
                )
                .slice(0, 5)
                .map((t: any) => ({
                    id: t._id, type: 'task' as const,
                    title: t.title,
                    subtitle: `Task · ${t.status} · ${t.priority}${t.project ? ` · ${t.project.title}` : ''}`,
                    link: '/tasks',
                }));

            setResults([...projectHits, ...taskHits]);
            open('search');
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [open, close]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setQuery(q);
        if (timer.current) clearTimeout(timer.current);
        if (!q.trim()) { setResults([]); close(); return; }
        timer.current = setTimeout(() => search(q), 300);
    };

    const handleSelect = (r: SearchResult) => {
        setQuery('');
        setResults([]);
        close();
        navigate(r.link);
    };

    const TYPE_ICON: Record<string, string> = { project: '📁', task: '✅' };

    return (
        <div ref={ref} className="header-search" style={{ position: 'relative' }} data-dropdown>
            <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
                type="text"
                placeholder="Search projects, tasks, skills..."
                className="search-input"
                value={query}
                onChange={handleChange}
                onFocus={() => { if (results.length > 0) open('search'); }}
            />
            {loading && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                    <span className="spinner" style={{ borderTopColor: 'var(--accent-blue)', borderColor: 'var(--border)', width: 12, height: 12 }} />
                </div>
            )}
            {isOpen && results.length > 0 && (
                <div className="search-dropdown">
                    {results.map(r => (
                        <div key={r.id} className="search-result-item" onClick={() => handleSelect(r)}>
                            <span className="search-result-icon">{TYPE_ICON[r.type]}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.845rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {r.title}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{r.subtitle}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {isOpen && query && results.length === 0 && !loading && (
                <div className="search-dropdown">
                    <div style={{ padding: '14px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        No results for "{query}"
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Notification Bell ────────────────────────────────────────────────────────
interface Notif {
    _id: string; type: string; message: string;
    link: string; read: boolean; createdAt: string;
}

function NotificationBell() {
    const [notifs, setNotifs]       = useState<Notif[]>([]);
    const [unread, setUnread]       = useState(0);
    const [hasMore, setHasMore]     = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const ref                       = useRef<HTMLDivElement>(null);
    const navigate                  = useNavigate();
    const { openId, open, close }   = useDropdown();
    const isOpen                    = openId === 'notifications';

    const fetchNotifs = useCallback(async () => {
        try {
            const res = await api.get('/api/notifications?limit=20');
            setNotifs(res.data.notifications);
            setUnread(res.data.unreadCount);
            setHasMore(res.data.hasMore);
        } catch { /* silent */ }
    }, []);

    const loadMore = async () => {
        if (!notifs.length) return;
        setLoadingMore(true);
        try {
            const last = notifs[notifs.length - 1]._id;
            const res = await api.get(`/api/notifications?limit=20&before=${last}`);
            setNotifs(prev => [...prev, ...res.data.notifications]);
            setHasMore(res.data.hasMore);
        } catch { /* silent */ }
        finally { setLoadingMore(false); }
    };

    // Poll every 30s
    useEffect(() => {
        fetchNotifs();
        const id = setInterval(fetchNotifs, 30000);
        return () => clearInterval(id);
    }, [fetchNotifs]);

    const markAllRead = async () => {
        await api.patch('/api/notifications/read-all');
        setNotifs(n => n.map(x => ({ ...x, read: true })));
        setUnread(0);
    };

    const handleClick = async (n: Notif) => {
        if (!n.read) {
            await api.patch(`/api/notifications/${n._id}/read`);
            setNotifs(prev => prev.map(x => x._id === n._id ? { ...x, read: true } : x));
            setUnread(u => Math.max(0, u - 1));
        }
        close();
        if (n.link) navigate(n.link);
    };

    const TYPE_ICON: Record<string, string> = {
        task_assigned:    '🎯',
        task_completed:   '✅',
        proposal_approved:'🎉',
        proposal_rejected:'❌',
        proposal_hold:    '⏸️',
        project_deleted:  '🗑️',
    };

    const timeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1)  return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    };

    return (
        <div ref={ref} style={{ position: 'relative' }} data-dropdown>
            <button
                className="header-icon-btn"
                title="Notifications"
                onClick={() => isOpen ? close() : open('notifications')}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unread > 0 && (
                    <span className="notif-dot" style={{ background: 'var(--accent-red)' }} />
                )}
            </button>

            {isOpen && (
                <div className="notif-dropdown">
                    <div className="notif-header">
                        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Notifications</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {unread > 0 && (
                                <span style={{
                                    background: 'var(--accent-red)', color: '#fff',
                                    fontSize: '0.65rem', fontWeight: 700,
                                    padding: '1px 7px', borderRadius: 100,
                                }}>{unread}</span>
                            )}
                            {unread > 0 && (
                                <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
                            )}
                        </div>
                    </div>

                    <div className="notif-list">
                        {notifs.length === 0 ? (
                            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                No notifications yet
                            </div>
                        ) : notifs.map(n => (
                            <div
                                key={n._id}
                                className={`notif-item ${!n.read ? 'notif-unread' : ''}`}
                                onClick={() => handleClick(n)}
                            >
                                <div className="notif-icon">{TYPE_ICON[n.type] || '🔔'}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.message}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>{timeAgo(n.createdAt)}</div>
                                </div>
                                {!n.read && <div className="notif-unread-dot" />}
                            </div>
                        ))}
                        {hasMore && (
                            <div style={{ padding: '8px 16px', textAlign: 'center' }}>
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontSize: '0.78rem', color: 'var(--accent-blue)', fontWeight: 600,
                                    }}
                                >
                                    {loadingMore ? 'Loading...' : 'Load more'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main app layout (sidebar + header) ───────────────────────────────────────
function AppLayout() {
    const { user, logout, isAdmin } = useAuth();
    const { dark, toggle } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const [sidebarProjects, setSidebarProjects] = useState<{ _id: string; title: string; status: string }[]>([]);

    // Fetch projects for sidebar — refetch whenever route changes (catches new project creation)
    useEffect(() => {
        api.get('/api/projects')
            .then(r => setSidebarProjects(r.data.slice(0, 5)))
            .catch(() => {});
    }, [location.pathname]);

    const PROJECT_DOT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'];
    const STATUS_LABEL: Record<string, string> = {
        planning: 'Planning', active: 'Active', 'on-hold': 'Hold',
        completed: 'Done', cancelled: 'Cancelled',
    };

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <div className="brand-logo">S</div>
                    <div>
                        <div className="brand-text">SolvePM</div>
                        <div className="brand-workspace">Solvevare Workspace ▾</div>
                    </div>
                </div>

                <div className="nav-section-label">MAIN MENU</div>
                <nav className="sidebar-nav">
                    <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></span>
                        Dashboard
                    </NavLink>
                    <NavLink to="/projects" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                        Projects
                    </NavLink>
                    <NavLink to="/tasks" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>
                        My Tasks
                    </NavLink>
                    <NavLink to="/developers" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                        Team
                    </NavLink>
                    <NavLink to="/timeline" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
                        Timeline
                    </NavLink>

                    {/* Admin only */}
                    {isAdmin && (
                        <NavLink to="/proposals" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="23 11 17 11"/><line x1="20" y1="8" x2="20" y2="14"/></svg></span>
                            Proposals
                            <span className="nav-badge">!</span>
                        </NavLink>
                    )}
                    {/* Profile — visible to all */}
                    <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                        My Profile
                    </NavLink>
                </nav>

                <div className="nav-section-label" style={{ marginTop: 16 }}>PROJECTS</div>
                <div className="sidebar-projects">
                    {sidebarProjects.length === 0 ? (
                        <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                            No projects yet
                        </div>
                    ) : sidebarProjects.map((proj, i) => (
                        <div
                            key={proj._id}
                            className="project-item"
                            onClick={() => navigate(`/projects/${proj._id}`)}
                        >
                            <span className="project-dot" style={{ background: PROJECT_DOT_COLORS[i % 5] }} />
                            <span className="project-name">{proj.title}</span>
                            <span className="project-status">{STATUS_LABEL[proj.status] ?? proj.status}</span>
                        </div>
                    ))}
                </div>

                <div className="sidebar-bottom">
                    <button className="nav-item" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={logout}>
                        <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
                        Logout
                    </button>
                </div>
            </aside>

            <div className="right-wrapper">
                <header className="top-header">
                    <GlobalSearch />
                    <div className="header-actions">
                        <button className="header-icon-btn" title="Refresh" onClick={() => window.location.reload()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                        <button className="theme-toggle-btn" title={dark ? 'Switch to Light' : 'Switch to Dark'} onClick={toggle}>
                            {dark
                                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                            }
                        </button>
                        <NotificationBell />
                        <div className="header-avatar" onClick={() => navigate('/profile')} title="My Profile">{user?.name?.charAt(0).toUpperCase() || 'U'}</div>
                    </div>
                </header>

                <main className="main-content">
                    <Routes>
                        <Route path="/"           element={<Dashboard />} />
                        <Route path="/projects"      element={<Projects />} />
                        <Route path="/projects/:id"  element={<ProjectDetail />} />
                        <Route path="/tasks"      element={<Tasks />} />
                        <Route path="/developers" element={<Developers />} />
                        <Route path="/timeline"   element={<Timeline />} />
                        <Route path="/profile"   element={<Profile />} />
                        <Route path="/proposals"  element={isAdmin ? <Proposals /> : <Navigate to="/" replace />} />
                        <Route path="*"           element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </div>
    );
}

// ── Root router ───────────────────────────────────────────────────────────────
function AppRouter() {
    const { token } = useAuth();

    return (
        <Routes>
            {/* Public auth routes — no sidebar/header */}
            <Route path="/login"  element={token ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/signup" element={token ? <Navigate to="/" replace /> : <Signup />} />

            {/* Protected app routes */}
            <Route path="/*" element={
                <RequireAuth>
                    <DropdownProvider>
                        <AppLayout />
                    </DropdownProvider>
                </RequireAuth>
            } />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <Toaster position="top-right" toastOptions={{ style: { fontSize: '0.875rem', borderRadius: '10px' } }} />
                    <AppRouter />
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}
