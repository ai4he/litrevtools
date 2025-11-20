import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Clock, CheckCircle, AlertCircle, Play, Trash2, Search, X, RefreshCw } from 'lucide-react';
import { projectAPI } from '../utils/api';
import { useSocket } from '../hooks/useSocket';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  created_at: Date;
  updated_at: Date;
  step1_session_id?: string;
  step2_session_id?: string;
  step3_session_id?: string;
  step1_complete: boolean;
  step2_complete: boolean;
  step3_complete: boolean;
  current_step?: 1 | 2 | 3;
  error_message?: string;
}

const ProjectsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed' | 'error'>('all');

  // Load projects on mount and set up polling
  useEffect(() => {
    loadProjects();
    const interval = setInterval(loadProjects, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Filter projects based on search and status
  useEffect(() => {
    let filtered = projects;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    setFilteredProjects(filtered);
  }, [projects, searchQuery, statusFilter]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await projectAPI.getAll();
      setProjects(response.projects || []);
    } catch (err: any) {
      console.error('Error loading projects:', err);
      setError(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setCreating(true);
      setError('');
      const response = await projectAPI.create({
        name: newProjectName,
        description: newProjectDescription || undefined
      });

      if (response.success) {
        setShowCreateModal(false);
        setNewProjectName('');
        setNewProjectDescription('');
        await loadProjects();

        // Navigate to the new project
        navigate(`/projects/${response.project.id}`);
      }
    } catch (err: any) {
      console.error('Error creating project:', err);
      setError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This will delete all associated sessions and data.`)) {
      return;
    }

    try {
      await projectAPI.delete(projectId);
      await loadProjects();
    } catch (err: any) {
      console.error('Error deleting project:', err);
      setError(err.response?.data?.message || 'Failed to delete project');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Play className="text-blue-500" size={20} />;
      case 'paused':
        return <Clock className="text-yellow-500" size={20} />;
      case 'completed':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'error':
        return <AlertCircle className="text-red-500" size={20} />;
      default:
        return <FolderOpen className="text-gray-500" size={20} />;
    }
  };

  const getProgressPercentage = (project: Project): number => {
    let completedSteps = 0;
    if (project.step1_complete) completedSteps++;
    if (project.step2_complete) completedSteps++;
    if (project.step3_complete) completedSteps++;
    return Math.round((completedSteps / 3) * 100);
  };

  const getStatusText = (project: Project): string => {
    if (project.status === 'error' && project.error_message) {
      return `Error: ${project.error_message}`;
    }
    if (project.status === 'completed') {
      return 'All steps completed';
    }
    if (project.current_step) {
      const stepNames = ['Search', 'Filtering', 'Generation'];
      return `Step ${project.current_step}: ${stepNames[project.current_step - 1]}`;
    }
    return 'Not started';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-xl text-gray-600">Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">My Projects</h1>
          <p className="text-gray-600 mt-2">
            Manage your literature review projects
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadProjects}
            className="btn-secondary flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            New Project
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search projects by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'active'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'completed'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="mx-auto text-gray-400" size={64} />
          {projects.length === 0 ? (
            <>
              <h3 className="text-xl font-semibold text-gray-700 mt-4">No projects yet</h3>
              <p className="text-gray-500 mt-2">Create your first project to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary mt-6 inline-flex items-center gap-2"
              >
                <Plus size={20} />
                Create Project
              </button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-semibold text-gray-700 mt-4">No matching projects</h3>
              <p className="text-gray-500 mt-2">Try adjusting your search or filters</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="btn-secondary mt-6 inline-flex items-center gap-2"
              >
                <X size={18} />
                Clear Filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 cursor-pointer border border-gray-200"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              {/* Project Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(project.status)}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.id, project.name);
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete project"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress</span>
                  <span>{getProgressPercentage(project)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${getProgressPercentage(project)}%` }}
                  />
                </div>
              </div>

              {/* Steps Checklist */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  {project.step1_complete ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : (
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
                  )}
                  <span className={project.step1_complete ? 'text-gray-800' : 'text-gray-500'}>
                    Step 1: Search & Extraction
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {project.step2_complete ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : (
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
                  )}
                  <span className={project.step2_complete ? 'text-gray-800' : 'text-gray-500'}>
                    Step 2: Semantic Filtering
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {project.step3_complete ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : (
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
                  )}
                  <span className={project.step3_complete ? 'text-gray-800' : 'text-gray-500'}>
                    Step 3: Output Generation
                  </span>
                </div>
              </div>

              {/* Status */}
              <div className="text-sm text-gray-600 border-t pt-3">
                <p>{getStatusText(project)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Updated {new Date(project.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Create New Project</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Literature Review"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Brief description of your project..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                  setError('');
                }}
                className="btn-secondary"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                className="btn-primary"
                disabled={creating || !newProjectName.trim()}
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsDashboard;
