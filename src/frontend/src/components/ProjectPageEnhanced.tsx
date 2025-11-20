import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Square, CheckCircle, Settings } from 'lucide-react';
import { projectAPI } from '../utils/api';
import { Step1Search } from './Step1Search';
import { Step2SemanticFiltering, Step2SemanticFilteringRef } from './Step2SemanticFiltering';
import { Step3LatexGeneration, Step3LatexGenerationRef } from './Step3LatexGeneration';

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

const ProjectPageEnhanced: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);
  const [projectMode, setProjectMode] = useState(true);

  const step2Ref = useRef<Step2SemanticFilteringRef>(null);
  const step3Ref = useRef<Step3LatexGenerationRef>(null);

  useEffect(() => {
    if (id) {
      loadProject();
      // Poll for updates every 5 seconds
      const interval = setInterval(loadProject, 5000);
      return () => clearInterval(interval);
    }
  }, [id]);

  const loadProject = async () => {
    if (!id) return;

    try {
      setLoading(activeTab === 1 && !project); // Only show loading on initial load
      setError('');
      const response = await projectAPI.getById(id);
      setProject(response.project);

      // Set active tab based on project state
      if (response.project.current_step) {
        setActiveTab(response.project.current_step);
      } else if (response.project.step1_complete && !response.project.step2_complete) {
        setActiveTab(2);
      } else if (response.project.step2_complete && !response.project.step3_complete) {
        setActiveTab(3);
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

  // Step 1 completion handler
  const handleStep1Complete = async (sessionId: string, _rawData: any[], _autoMode: boolean, _params?: any) => {
    console.log('[ProjectPage] Step 1 completed:', sessionId);
    if (id) {
      // The project should already be updated by the backend, just reload
      await loadProject();
      // Automatically switch to Step 2
      setActiveTab(2);
    }
  };

  // Step 2 completion handler
  const handleStep2Complete = async (sessionId: string, _labeledData: any[]) => {
    console.log('[ProjectPage] Step 2 completed:', sessionId);
    if (id) {
      await loadProject();
      // Automatically switch to Step 3
      setActiveTab(3);
    }
  };

  // Step 3 completion handler
  const handleStep3Complete = async (sessionId: string) => {
    console.log('[ProjectPage] Step 3 completed:', sessionId);
    if (id) {
      await loadProject();
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

        <div className="flex justify-between items-start mb-4">
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

        {/* Progress Overview */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                {project.step1_complete ? (
                  <CheckCircle size={20} className="text-green-500" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                )}
                <span className={`text-sm font-medium ${project.step1_complete ? 'text-gray-800' : 'text-gray-500'}`}>
                  Step 1
                </span>
                {project.current_step === 1 && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Running</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {project.step2_complete ? (
                  <CheckCircle size={20} className="text-green-500" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                )}
                <span className={`text-sm font-medium ${project.step2_complete ? 'text-gray-800' : 'text-gray-500'}`}>
                  Step 2
                </span>
                {project.current_step === 2 && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Running</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {project.step3_complete ? (
                  <CheckCircle size={20} className="text-green-500" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                )}
                <span className={`text-sm font-medium ${project.step3_complete ? 'text-gray-800' : 'text-gray-500'}`}>
                  Step 3
                </span>
                {project.current_step === 3 && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Running</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

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
              Step 1: Search & Extraction
            </button>
            <button
              onClick={() => setActiveTab(2)}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 2
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Step 2: Semantic Filtering
            </button>
            <button
              onClick={() => setActiveTab(3)}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 3
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Step 3: Output Generation
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 1 && (
            <Step1Search
              onSearchComplete={handleStep1Complete}
              disabled={project.step1_complete}
            />
          )}

          {activeTab === 2 && (
            <Step2SemanticFiltering
              ref={step2Ref}
              onFilteringComplete={handleStep2Complete}
              step1SessionId={project.step1_session_id}
              disabled={!project.step1_complete || project.step2_complete}
            />
          )}

          {activeTab === 3 && (
            <Step3LatexGeneration
              ref={step3Ref}
              onGenerationComplete={handleStep3Complete}
              step1SessionId={project.step1_session_id}
              step2SessionId={project.step2_session_id}
              disabled={!project.step1_complete}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectPageEnhanced;
