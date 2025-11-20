import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Square, CheckCircle } from 'lucide-react';
import { projectAPI } from '../utils/api';

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

const ProjectPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (id) {
      loadProject();
    }
  }, [id]);

  const loadProject = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');
      const response = await projectAPI.getById(id);
      setProject(response.project);

      // Set active tab to current step if available
      if (response.project.current_step) {
        setActiveTab(response.project.current_step);
      }
    } catch (err: any) {
      console.error('Error loading project:', err);
      setError(err.response?.data?.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!id) return;
    try {
      await projectAPI.pause(id);
      await loadProject();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to pause project');
    }
  };

  const handleResume = async () => {
    if (!id) return;
    try {
      await projectAPI.resume(id);
      await loadProject();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resume project');
    }
  };

  const handleStop = async () => {
    if (!id || !confirm('Are you sure you want to stop the current step?')) return;
    try {
      await projectAPI.stop(id);
      await loadProject();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to stop project');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-xl text-gray-600">Loading project...</div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold text-gray-700">Project not found</h2>
          <button onClick={() => navigate('/projects')} className="btn-primary mt-4">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft size={20} />
          Back to Projects
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">{project.name}</h1>
            {project.description && (
              <p className="text-gray-600 mt-2">{project.description}</p>
            )}
          </div>

          {/* Control Buttons */}
          {project.current_step && (
            <div className="flex gap-2">
              {project.status === 'paused' ? (
                <button onClick={handleResume} className="btn-primary flex items-center gap-2">
                  <Play size={18} />
                  Resume
                </button>
              ) : (
                <button onClick={handlePause} className="btn-secondary flex items-center gap-2">
                  <Pause size={18} />
                  Pause
                </button>
              )}
              <button onClick={handleStop} className="btn-danger flex items-center gap-2">
                <Square size={18} />
                Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Progress Overview */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Project Progress</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {project.step1_complete && <CheckCircle size={20} className="text-green-500" />}
                <span className={`font-medium ${project.step1_complete ? 'text-gray-800' : 'text-gray-500'}`}>
                  Step 1: Search & Extraction
                </span>
                {project.current_step === 1 && (
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    In Progress
                  </span>
                )}
              </div>
              {project.step1_session_id && (
                <p className="text-sm text-gray-600">Session: {project.step1_session_id}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {project.step2_complete && <CheckCircle size={20} className="text-green-500" />}
                <span className={`font-medium ${project.step2_complete ? 'text-gray-800' : 'text-gray-500'}`}>
                  Step 2: Semantic Filtering
                </span>
                {project.current_step === 2 && (
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    In Progress
                  </span>
                )}
              </div>
              {project.step2_session_id && (
                <p className="text-sm text-gray-600">Session: {project.step2_session_id}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {project.step3_complete && <CheckCircle size={20} className="text-green-500" />}
                <span className={`font-medium ${project.step3_complete ? 'text-gray-800' : 'text-gray-500'}`}>
                  Step 3: Output Generation
                </span>
                {project.current_step === 3 && (
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    In Progress
                  </span>
                )}
              </div>
              {project.step3_session_id && (
                <p className="text-sm text-gray-600">Session: {project.step3_session_id}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Step Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab(1)}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 1
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Step 1: Search
            </button>
            <button
              onClick={() => setActiveTab(2)}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 2
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              disabled={!project.step1_complete}
            >
              Step 2: Filtering
            </button>
            <button
              onClick={() => setActiveTab(3)}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 3
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              disabled={!project.step1_complete}
            >
              Step 3: Generation
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 1 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Step 1: Search & Extraction</h3>
              <p className="text-gray-600 mb-4">
                Configure and run literature search using Semantic Scholar.
              </p>
              {/* TODO: Integrate with Step1Search component */}
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <p className="text-sm text-gray-600">
                  Step 1 configuration will be integrated here. For now, please use the standalone step pages.
                </p>
              </div>
            </div>
          )}

          {activeTab === 2 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Step 2: Semantic Filtering</h3>
              <p className="text-gray-600 mb-4">
                Apply AI-powered semantic filtering to your extracted papers.
              </p>
              {/* TODO: Integrate with Step2SemanticFiltering component */}
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <p className="text-sm text-gray-600">
                  Step 2 configuration will be integrated here. For now, please use the standalone step pages.
                </p>
              </div>
            </div>
          )}

          {activeTab === 3 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Step 3: Output Generation</h3>
              <p className="text-gray-600 mb-4">
                Generate research outputs including LaTeX papers, BibTeX, and PRISMA diagrams.
              </p>
              {/* TODO: Integrate with Step3LatexGeneration component */}
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <p className="text-sm text-gray-600">
                  Step 3 configuration will be integrated here. For now, please use the standalone step pages.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectPage;
