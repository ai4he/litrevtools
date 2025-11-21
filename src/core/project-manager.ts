/**
 * Project Manager - Orchestrates project-based workflow management
 */

import { LitRevDatabase } from './database';
import { LitRevTools } from './index';
import {
  Project,
  ProjectWithSteps,
  ProjectProgress,
  CreateProjectParams,
  UpdateProjectParams,
  SearchParameters,
  SearchProgress,
  LLMFilteringProgress,
  OutputProgress
} from './types';

export class ProjectManager {
  private database: LitRevDatabase;
  private litrev: LitRevTools;

  constructor(database: LitRevDatabase, litrev: LitRevTools) {
    this.database = database;
    this.litrev = litrev;
  }

  // ============================================================================
  // Project CRUD Operations
  // ============================================================================

  /**
   * Create a new project
   */
  createProject(params: CreateProjectParams): string {
    const projectId = this.database.createProject({
      name: params.name,
      description: params.description
    });

    console.log(`[ProjectManager] Created project: ${projectId} (${params.name})`);
    return projectId;
  }

  /**
   * Get a project by ID
   */
  getProject(projectId: string): Project | null {
    return this.database.getProject(projectId);
  }

  /**
   * Get a project with populated step data
   */
  getProjectWithSteps(projectId: string): ProjectWithSteps | null {
    return this.database.getProjectWithSteps(projectId);
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    return this.database.getAllProjects();
  }

  /**
   * Update project metadata
   */
  updateProject(projectId: string, params: UpdateProjectParams): void {
    this.database.updateProject(projectId, params);
    console.log(`[ProjectManager] Updated project: ${projectId}`);
  }

  /**
   * Delete a project and all associated sessions
   */
  deleteProject(projectId: string): void {
    this.database.deleteProject(projectId);
    console.log(`[ProjectManager] Deleted project: ${projectId}`);
  }

  // ============================================================================
  // Step Execution
  // ============================================================================

  /**
   * Start Step 1 (Search & Extraction) for a project
   */
  async startStep1(
    projectId: string,
    parameters: SearchParameters,
    callbacks?: {
      onProgress?: (progress: SearchProgress) => void;
      onPaper?: (paper: any) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<string> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    console.log(`[ProjectManager] Starting Step 1 for project: ${projectId}`);

    try {
      // Set current step
      this.database.setProjectCurrentStep(projectId, 1);
      this.database.updateProject(projectId, { status: 'active' });

      // Start search
      const sessionId = await this.litrev.startSearch(parameters, callbacks);

      // Link session to project
      this.database.updateProjectStepSession(projectId, 1, sessionId);

      console.log(`[ProjectManager] Step 1 started with session: ${sessionId}`);
      return sessionId;
    } catch (error: any) {
      console.error(`[ProjectManager] Error starting Step 1:`, error);
      this.database.setProjectError(projectId, error.message);
      throw error;
    }
  }

  /**
   * Start Step 2 (Semantic Filtering) for a project
   */
  async startStep2(
    projectId: string,
    parameters: {
      inclusionPrompt?: string;
      exclusionPrompt?: string;
      batchSize?: number;
      model?: string;
    },
    onProgress?: (progress: LLMFilteringProgress) => void
  ): Promise<string> {
    const project = this.getProjectWithSteps(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (!project.step1_session_id) {
      throw new Error('Step 1 must be completed before starting Step 2');
    }

    console.log(`[ProjectManager] Starting Step 2 for project: ${projectId}`);

    try {
      // Set current step
      this.database.setProjectCurrentStep(projectId, 2);
      this.database.updateProject(projectId, { status: 'active' });

      // Mark Step 1 as complete
      this.database.markProjectStepComplete(projectId, 1);

      // Start semantic filtering
      await this.litrev.applySemanticFiltering(
        project.step1_session_id,
        parameters.inclusionPrompt,
        parameters.exclusionPrompt,
        onProgress,
        parameters.batchSize,
        parameters.model
      );

      // Link session to project (use same session ID from step1)
      this.database.updateProjectStepSession(projectId, 2, project.step1_session_id);

      console.log(`[ProjectManager] Step 2 started with session: ${project.step1_session_id}`);
      return project.step1_session_id;
    } catch (error: any) {
      console.error(`[ProjectManager] Error starting Step 2:`, error);
      this.database.setProjectError(projectId, error.message);
      throw error;
    }
  }

  /**
   * Start Step 3 (Output Generation) for a project
   */
  async startStep3(
    projectId: string,
    parameters?: {
      dataSource?: 'step1' | 'step2';
      model?: string;
      batchSize?: number;
      latexPrompt?: string;
    },
    onProgress?: (progress: OutputProgress) => void
  ): Promise<string> {
    const project = this.getProjectWithSteps(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Determine which session to use
    let sourceSessionId: string;
    if (parameters?.dataSource === 'step2' && project.step2_session_id) {
      sourceSessionId = project.step2_session_id;
      if (!project.step2_complete) {
        console.warn(`[ProjectManager] Step 2 not marked as complete, proceeding anyway`);
      }
    } else if (project.step1_session_id) {
      sourceSessionId = project.step1_session_id;
    } else {
      throw new Error('No source session available for Step 3');
    }

    console.log(`[ProjectManager] Starting Step 3 for project: ${projectId} using session: ${sourceSessionId}`);

    try {
      // Set current step
      this.database.setProjectCurrentStep(projectId, 3);
      this.database.updateProject(projectId, { status: 'active' });

      // Mark Step 2 as complete if using step2 data
      if (parameters?.dataSource === 'step2') {
        this.database.markProjectStepComplete(projectId, 2);
      }

      // Start output generation
      await this.litrev.generateOutputsWithDataSource(
        sourceSessionId,
        parameters?.dataSource || 'step1',
        onProgress
      );

      // Link session to project (use same session as source)
      this.database.updateProjectStepSession(projectId, 3, sourceSessionId);

      // Mark Step 3 as complete
      this.database.markProjectStepComplete(projectId, 3);
      this.database.setProjectCurrentStep(projectId, null);
      this.database.updateProject(projectId, { status: 'completed' });

      console.log(`[ProjectManager] Step 3 completed for project: ${projectId}`);
      return sourceSessionId;
    } catch (error: any) {
      console.error(`[ProjectManager] Error starting Step 3:`, error);
      this.database.setProjectError(projectId, error.message);
      throw error;
    }
  }

  // ============================================================================
  // Project Control Methods
  // ============================================================================

  /**
   * Pause current running step in a project
   */
  pauseProject(projectId: string): void {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    console.log(`[ProjectManager] Pausing project: ${projectId} (current step: ${project.current_step})`);

    try {
      switch (project.current_step) {
        case 1:
          this.litrev.pauseSearch();
          break;
        case 2:
          this.litrev.pauseSemanticFiltering();
          break;
        case 3:
          this.litrev.pauseOutputGeneration();
          break;
        default:
          console.warn(`[ProjectManager] No active step to pause`);
      }

      this.database.updateProject(projectId, { status: 'paused' });
    } catch (error: any) {
      console.error(`[ProjectManager] Error pausing project:`, error);
      throw error;
    }
  }

  /**
   * Resume paused step in a project
   */
  resumeProject(projectId: string): void {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    console.log(`[ProjectManager] Resuming project: ${projectId} (current step: ${project.current_step})`);

    try {
      switch (project.current_step) {
        case 1:
          this.litrev.resumeSearch();
          break;
        case 2:
          this.litrev.resumeSemanticFiltering();
          break;
        case 3:
          this.litrev.resumeOutputGeneration();
          break;
        default:
          console.warn(`[ProjectManager] No paused step to resume`);
      }

      this.database.updateProject(projectId, { status: 'active' });
    } catch (error: any) {
      console.error(`[ProjectManager] Error resuming project:`, error);
      throw error;
    }
  }

  /**
   * Stop current running step in a project
   */
  stopProject(projectId: string): void {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    console.log(`[ProjectManager] Stopping project: ${projectId} (current step: ${project.current_step})`);

    try {
      switch (project.current_step) {
        case 1:
          this.litrev.stopSearch();
          break;
        case 2:
          this.litrev.stopSemanticFiltering();
          break;
        case 3:
          this.litrev.stopOutputGeneration();
          break;
        default:
          console.warn(`[ProjectManager] No active step to stop`);
      }

      this.database.setProjectCurrentStep(projectId, null);
      this.database.updateProject(projectId, { status: 'active' });
    } catch (error: any) {
      console.error(`[ProjectManager] Error stopping project:`, error);
      this.database.setProjectError(projectId, error.message);
      throw error;
    }
  }

  // ============================================================================
  // Step Completion
  // ============================================================================

  /**
   * Mark a step as complete for a project
   */
  markStepComplete(projectId: string, step: 1 | 2 | 3, sessionId?: string): void {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    console.log(`[ProjectManager] Marking step ${step} as complete for project: ${projectId}`);

    // If sessionId is provided, link it to the project step
    if (sessionId) {
      this.database.updateProjectStepSession(projectId, step, sessionId);
      console.log(`[ProjectManager] Linked session ${sessionId} to step ${step}`);
    }

    this.database.markProjectStepComplete(projectId, step);
    this.database.setProjectCurrentStep(projectId, null);
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Get combined progress for all steps in a project
   */
  getProjectProgress(projectId: string): ProjectProgress | null {
    const project = this.getProjectWithSteps(projectId);
    if (!project) return null;

    const progress: ProjectProgress = {
      projectId,
      currentStep: project.current_step || null,
      overallProgress: 0
    };

    // Calculate overall progress based on completed steps
    let completedSteps = 0;
    if (project.step1_complete) completedSteps++;
    if (project.step2_complete) completedSteps++;
    if (project.step3_complete) completedSteps++;

    progress.overallProgress = Math.round((completedSteps / 3) * 100);

    // Add step-specific progress if available
    if (project.step1 && project.current_step === 1) {
      progress.step1Progress = project.step1.progress;
      // Fine-tune overall progress based on current step
      progress.overallProgress = Math.round((completedSteps / 3 + project.step1.progress.progress / 300) * 100);
    }

    return progress;
  }
}
