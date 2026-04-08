import { useRef, useState, useEffect } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

interface Requirement {
    _id: string;
    filename: string;
    uploadedAt: string;
}

interface Project {
    _id: string;
    title: string;
    requirements: Requirement[];
}

export default function Upload() {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState<string | null>(null);
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const [uploaded, setUploaded] = useState<Requirement[]>([]);
    const [loading, setLoading] = useState(true);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const res = await api.get('/api/projects');
                const projects = res.data;
                if (projects && projects.length > 0) {
                    setActiveProject(projects[0]);
                    setUploaded(projects[0].requirements || []);
                }
            } catch {
                toast.error('Failed to load project details');
            } finally {
                setLoading(false);
            }
        };
        fetchProject();
    }, []);

    const handleUpload = async (file: File) => {
        if (!file) return;
        setUploading(true);
        try {
            let targetProjectId = activeProject?._id;
            
            if (!targetProjectId) {
                const projRes = await api.post('/api/projects', {
                    title: 'Default Project',
                    description: 'Auto-created for requirements',
                    status: 'planning'
                });
                targetProjectId = projRes.data._id;
                setActiveProject(projRes.data);
            }

            const formData = new FormData();
            formData.append('file', file);
            
            const res = await api.post(`/api/projects/${targetProjectId}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            
            toast.success(`Uploaded: ${res.data.requirement.filename}`);
            setUploaded((prev) => [res.data.requirement, ...prev]);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleGenerateTasks = async (requirementId: string) => {
        if (!activeProject) return;
        setGenerating(requirementId);
        try {
            const res = await api.post(`/api/projects/${activeProject._id}/generate-tasks/${requirementId}`);
            toast.success(res.data.message);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'AI task generation failed');
        } finally {
            setGenerating(null);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleUpload(file);
    };

    if (loading) return <div className="loading-text">Loading workspace...</div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">📁 Upload Requirements</h1>
                <p className="page-subtitle">
                    {activeProject ? `Uploading to: ${activeProject.title}` : 'Upload your project requirement file and let AI generate tasks'}
                </p>
            </div>

            <div className="card" style={{ marginBottom: 24 }}>
                <div
                    className={`upload-area ${dragging ? 'drag-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                >
                    <div className="upload-icon">📄</div>
                    <div className="upload-text">
                        <strong style={{ color: 'var(--text-primary)' }}>Click to browse</strong> or drag & drop<br />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Supports .txt, .md and .pdf files (max 5MB)</span>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".txt,.md,.pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                    />
                </div>
                {uploading && <div className="loading-text" style={{ padding: 16 }}>Uploading... ⏳</div>}
            </div>

            {uploaded.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>Uploaded Requirements</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Filename</th>
                                <th>Uploaded At</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {uploaded.map((req) => (
                                <tr key={req._id}>
                                    <td>📄 {req.filename}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                        {new Date(req.uploadedAt).toLocaleString()}
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={generating === req._id}
                                            onClick={() => handleGenerateTasks(req._id)}
                                        >
                                            {generating === req._id ? '⏳ Generating...' : '🤖 Generate Tasks with AI'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

