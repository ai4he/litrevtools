import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Square, CheckCircle } from 'lucide-react';
import { projectAPI, sessionAPI } from '../utils/api';
import { Step1Search } from './Step1Search';
import { Step2SemanticFiltering, Step2SemanticFilteringRef } from './Step2SemanticFiltering';
import { Step3LatexGeneration, Step3LatexGenerationRef } from './Step3LatexGeneration';
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

const ProjectPageEnhanced: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);
  const [stepRunningStatus, setStepRunningStatus] = useState<{
    step: 1 | 2 | 3 | null;
    status: 'running' | 'completed' | 'error' | null;
    progress?: number;
  }>({ step: null, status: null });

  const step2Ref = useRef<Step2SemanticFilteringRef>(null);
  const step3Ref = useRef<Step3LatexGenerationRef>(null);
  const isInitialLoadRef = useRef(true);
  const { socket, reconnectCount } = useSocket();

  // Track whether a step is running for polling interval
  const isStepRunningRef = useRef(false);

  useEffect(() => {
    isStepRunningRef.current = project?.current_step !== undefined && project?.current_step !== null;
  }, [project?.current_step]);

  const loadProject = useCallback(async () => {
    if (!id) return;

    try {
      setLoading((prev) => isInitialLoadRef.current ? true : prev);
      setError('');
      const response = await projectAPI.getById(id);
      setProject(response.project);

      // Set active tab based on project state ONLY on initial load
      if (isInitialLoadRef.current) {
        if (response.project.current_step) {
          setActiveTab(response.project.current_step);
        } else if (response.project.step1_complete && !response.project.step2_complete) {
          setActiveTab(2);
        } else if (response.project.step2_complete && !response.project.step3_complete) {
          setActiveTab(3);
        }
        isInitialLoadRef.current = false;
      }
    } catch (err: any) {
      console.error('Error loading project:', err);
      setError(err.response?.data?.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Polling for project updates with dynamic interval
  useEffect(() => {
    if (id) {
      isInitialLoadRef.current = true; // Reset on ID change
      loadProject();

      // Dynamic polling: check the ref to determine interval
      // Start with shorter interval and adjust based on state
      let intervalId: ReturnType<typeof setInterval>;

      const startPolling = () => {
        // Use shorter polling interval (5s) when a step is running, 30s otherwise
        const pollInterval = isStepRunningRef.current ? 5000 : 30000;
        intervalId = setInterval(() => {
          loadProject();
          // Reschedule if interval should change
          const currentShouldBeShort = isStepRunningRef.current;
          const currentInterval = pollInterval;
          const newInterval = currentShouldBeShort ? 5000 : 30000;
          if (currentInterval !== newInterval) {
            clearInterval(intervalId);
            startPolling();
          }
        }, pollInterval);
      };

      startPolling();
      return () => clearInterval(intervalId);
    }
  }, [id, loadProject]);

  // Fetch step status immediately when project has a running step and we navigate back
  useEffect(() => {
    if (!project) return;

    const currentStep = project.current_step;
    if (!currentStep) {
      // No step running, clear the status
      setStepRunningStatus({ step: null, status: null });
      return;
    }

    // Get the session ID for the current step
    const sessionId = currentStep === 1 ? project.step1_session_id :
                      currentStep === 2 ? (project.step2_session_id || project.step1_session_id) :
                      (project.step3_session_id || project.step2_session_id || project.step1_session_id);

    if (!sessionId) return;

    console.log('[ProjectPage] Fetching step status for running step', currentStep, 'session:', sessionId);

    const fetchStepStatus = async () => {
      try {
        const response = await sessionAPI.getStepStatus(sessionId);
        if (response.success && response.stepStatus) {
          const { stepStatus } = response;
          console.log('[ProjectPage] Step status response:', stepStatus);

          setStepRunningStatus({
            step: stepStatus.step as 1 | 2 | 3,
            status: stepStatus.status as 'running' | 'completed' | 'error',
            progress: stepStatus.progress
          });

          // If step completed, refresh project to update completion status
          if (stepStatus.status === 'completed') {
            console.log('[ProjectPage] Step completed, refreshing project');
            loadProject();
          }
        }
      } catch (err) {
        console.error('[ProjectPage] Failed to fetch step status:', err);
      }
    };

    fetchStepStatus();
  }, [project?.current_step, project?.step1_session_id, project?.step2_session_id, project?.step3_session_id, loadProject]);

  // Socket.IO listener for real-time step progress updates
  useEffect(() => {
    if (!socket || !project) return;

    const currentStep = project.current_step;
    if (!currentStep) return;

    // Get the session ID for the current step
    const sessionId = currentStep === 1 ? project.step1_session_id :
                      currentStep === 2 ? (project.step2_session_id || project.step1_session_id) :
                      (project.step3_session_id || project.step2_session_id || project.step1_session_id);

    if (!sessionId) return;

    console.log('[ProjectPage] Setting up Socket.IO listeners for step', currentStep, 'session:', sessionId);

    // Subscribe to session
    socket.emit('subscribe', sessionId);

    // Progress event handlers for each step type
    const handleStep1Progress = (data: any) => {
      console.log('[ProjectPage] Step 1 progress:', data.status, data.progress);
      setStepRunningStatus({
        step: 1,
        status: data.status,
        progress: data.progress
      });
      if (data.status === 'completed') {
        console.log('[ProjectPage] Step 1 completed via Socket, refreshing project');
        loadProject();
      }
    };

    const handleStep2Progress = (data: any) => {
      console.log('[ProjectPage] Step 2 progress:', data.status, data.progress);
      setStepRunningStatus({
        step: 2,
        status: data.status,
        progress: data.progress
      });
      if (data.status === 'completed') {
        console.log('[ProjectPage] Step 2 completed via Socket, refreshing project');
        loadProject();
      }
    };

    const handleStep2Complete = (_data: any) => {
      console.log('[ProjectPage] Step 2 complete event received');
      setStepRunningStatus({ step: 2, status: 'completed' });
      loadProject();
    };

    const handleStep3Progress = (data: any) => {
      console.log('[ProjectPage] Step 3 progress:', data.status, data.progress);
      setStepRunningStatus({
        step: 3,
        status: data.status,
        progress: data.progress
      });
      if (data.status === 'completed') {
        console.log('[ProjectPage] Step 3 completed via Socket, refreshing project');
        loadProject();
      }
    };

    const handleOutputs = (_data: any) => {
      console.log('[ProjectPage] Outputs generated event received');
      setStepRunningStatus({ step: 3, status: 'completed' });
      loadProject();
    };

    // Listen for step-specific events
    const step1ProgressEvent = `progress:${sessionId}`;
    const step2ProgressEvent = `semantic-filter-progress:${sessionId}`;
    const step2CompleteEvent = `semantic-filter-complete:${sessionId}`;
    const step3ProgressEvent = `output-progress:${sessionId}`;
    const outputsEvent = `outputs:${sessionId}`;

    socket.on(step1ProgressEvent, handleStep1Progress);
    socket.on(step2ProgressEvent, handleStep2Progress);
    socket.on(step2CompleteEvent, handleStep2Complete);
    socket.on(step3ProgressEvent, handleStep3Progress);
    socket.on(outputsEvent, handleOutputs);

    return () => {
      console.log('[ProjectPage] Cleaning up Socket.IO listeners for session:', sessionId);
      socket.off(step1ProgressEvent, handleStep1Progress);
      socket.off(step2ProgressEvent, handleStep2Progress);
      socket.off(step2CompleteEvent, handleStep2Complete);
      socket.off(step3ProgressEvent, handleStep3Progress);
      socket.off(outputsEvent, handleOutputs);
      socket.emit('unsubscribe', sessionId);
    };
  }, [socket, project?.current_step, project?.step1_session_id, project?.step2_session_id, project?.step3_session_id, loadProject]);

  // Re-sync on socket reconnection
  useEffect(() => {
    if (reconnectCount === 0 || !project?.current_step) return;

    console.log('[ProjectPage] Socket reconnected, refreshing project');
    loadProject();
  }, [reconnectCount, loadProject]);

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
  const handleStep1Complete = useCallback(async (sessionId: string, _rawData: any[], _autoMode: boolean, _params?: any) => {
    console.log('[ProjectPage] Step 1 completed:', sessionId);
    if (id) {
      try {
        // Mark Step 1 as complete on the backend (and link the session ID)
        await projectAPI.completeStep(id, 1, sessionId);
        console.log('[ProjectPage] Marked Step 1 as complete and linked session:', sessionId);

        // Reload project to get updated state
        await loadProject();

        // Automatically switch to Step 2
        setActiveTab(2);
      } catch (error: any) {
        console.error('[ProjectPage] Error completing Step 1:', error);
        setError(error.response?.data?.message || 'Failed to mark step as complete');
      }
    }
  }, [id, loadProject]);

  // Step 2 completion handler
  const handleStep2Complete = useCallback(async (sessionId: string, _labeledData: any[]) => {
    console.log('[ProjectPage] Step 2 completed:', sessionId);
    if (id) {
      try {
        // Mark Step 2 as complete on the backend (and link the session ID)
        await projectAPI.completeStep(id, 2, sessionId);
        console.log('[ProjectPage] Marked Step 2 as complete and linked session:', sessionId);

        // Reload project to get updated state
        await loadProject();

        // Automatically switch to Step 3
        setActiveTab(3);
      } catch (error: any) {
        console.error('[ProjectPage] Error completing Step 2:', error);
        setError(error.response?.data?.message || 'Failed to mark step as complete');
      }
    }
  }, [id, loadProject]);

  // Step 3 completion handler
  const handleStep3Complete = useCallback(async (sessionId: string) => {
    console.log('[ProjectPage] Step 3 completed:', sessionId);
    if (id) {
      try {
        // Mark Step 3 as complete on the backend (and link the session ID)
        await projectAPI.completeStep(id, 3, sessionId);
        console.log('[ProjectPage] Marked Step 3 as complete and linked session:', sessionId);

        // Reload project to get updated state
        await loadProject();
      } catch (error: any) {
        console.error('[ProjectPage] Error completing Step 3:', error);
        setError(error.response?.data?.message || 'Failed to mark step as complete');
      }
    }
  }, [id, loadProject]);

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
                {(project.current_step === 1 || (stepRunningStatus.step === 1 && stepRunningStatus.status === 'running')) && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Running{stepRunningStatus.step === 1 && stepRunningStatus.progress !== undefined ? ` (${Math.round(stepRunningStatus.progress)}%)` : ''}
                  </span>
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
                {(project.current_step === 2 || (stepRunningStatus.step === 2 && stepRunningStatus.status === 'running')) && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Running{stepRunningStatus.step === 2 && stepRunningStatus.progress !== undefined ? ` (${Math.round(stepRunningStatus.progress)}%)` : ''}
                  </span>
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
                {(project.current_step === 3 || (stepRunningStatus.step === 3 && stepRunningStatus.status === 'running')) && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Running{stepRunningStatus.step === 3 && stepRunningStatus.progress !== undefined ? ` (${Math.round(stepRunningStatus.progress)}%)` : ''}
                  </span>
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
            <>
              {console.log('[ProjectPageEnhanced] Rendering Step1, project.step1_session_id:', project.step1_session_id)}
              <Step1Search
                key={`step1-${id}`}
                onSearchComplete={handleStep1Complete}
                disabled={project.step1_complete}
                existingSessionId={project.step1_session_id}
                isComplete={project.step1_complete}
              />
            </>
          )}

          {activeTab === 2 && (
            <Step2SemanticFiltering
              key={`step2-${id}`}
              ref={step2Ref}
              sessionId={project.step1_session_id || null}
              enabled={project.step1_complete && !project.step2_complete}
              onFilteringComplete={handleStep2Complete}
              isComplete={project.step2_complete}
            />
          )}

          {activeTab === 3 && (
            <Step3LatexGeneration
              key={`step3-${id}`}
              ref={step3Ref}
              sessionId={project.step2_session_id || project.step1_session_id || null}
              enabled={project.step1_complete}
              onComplete={handleStep3Complete}
              isComplete={project.step3_complete}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectPageEnhanced;
