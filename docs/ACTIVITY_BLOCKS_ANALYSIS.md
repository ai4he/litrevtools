# Activity Blocks Implementation Analysis

## Current Status
Activity blocks are **not yet implemented** in the codebase. The current branch 
`claude/add-step3-activity-blocks-013MPChLEneuvnZFFinUiPoc` is prepared for this feature.

However, there IS a solid foundation for activity tracking through the progress/status system.

---

## 1. UI Components Location

### Step 1: Search & Raw Data Extraction
- **File**: `/home/user/litrevtools/src/frontend/src/components/Step1Search.tsx`
- **Key Components**:
  - Main component: `Step1Search` (lines 17-200)
  - Uses: `ProgressDashboard` for status display
  - Handles: Search initiation, pause/resume/stop, progress tracking

### Step 2: Semantic Filtering
- **File**: `/home/user/litrevtools/src/frontend/src/components/Step2SemanticFiltering.tsx`
- **Key Components**:
  - Main component: `Step2SemanticFiltering` (lines 40-548)
  - Uses: `ProgressCard` for inline progress display
  - Handles: Filtering initiation, CSV upload, real-time status

### Step 3: LaTeX Generation (Foundation for Activity Blocks)
- **File**: `/home/user/litrevtools/src/frontend/src/components/Step3LatexGeneration.tsx`
- **Key Components**:
  - Main component: `Step3LatexGeneration`
  - Uses: `ProgressCard` for batch progress
  - Handles: Output generation with batch progress tracking

---

## 2. Current Activity Display Components

### ProgressDashboard Component
**Location**: `/home/user/litrevtools/src/frontend/src/components/ProgressDashboard.tsx`

**Purpose**: Comprehensive progress dashboard for Step 1 search

**Displays**:
- Status header with icon and badge (lines 125-166)
- Progress bar (lines 168-182)
- **Current Task & Next Task** blocks (lines 184-194) ← **Similar to Activity Blocks**
- Time information (lines 196-227)
- Paper date range (lines 229-273)
- Statistics grid (lines 275-299)
- Debug information section (lines 301-438)

**Key Features**:
```tsx
<div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
  <h4 className="text-sm font-semibold text-blue-900 mb-2">Current Task</h4>
  <p className="text-sm text-blue-800">{progress.currentTask || 'Initializing...'}</p>
</div>
<div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
  <h4 className="text-sm font-semibold text-purple-900 mb-2">Next Task</h4>
  <p className="text-sm text-purple-800">{progress.nextTask || 'Pending...'}</p>
</div>
```

This is the closest existing implementation to "activity blocks"!

### ProgressCard Component
**Location**: `/home/user/litrevtools/src/frontend/src/components/ProgressCard.tsx`

**Purpose**: Reusable card for showing inline progress

**Displays** (lines 53-163):
- Animated spinner and title
- Current task name and percentage
- Progress bar
- Batch progress details (if available)
- Error messages

**Data Structure** (lines 39-50):
```typescript
export interface ProgressCardProps {
  title: string;
  currentTask: string;
  progress: number; // 0-100
  stage?: string; // e.g., "csv", "bibtex", "latex"
  currentStage?: number;
  totalStages?: number;
  timeElapsed?: number;
  estimatedTimeRemaining?: number;
  batchProgress?: BatchProgress;
  error?: string;
  className?: string;
}
```

---

## 3. Data Structures for Status Updates

### ProgressUpdate (for Step 1)
**Location**: `/home/user/litrevtools/src/frontend/src/types/index.ts` (lines 51-76)

```typescript
export interface ProgressUpdate {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'estimating';
  currentTask: string;           // Current activity
  nextTask: string;              // Next activity
  totalPapers: number;
  processedPapers: number;
  includedPapers: number;
  excludedPapers: number;
  duplicateCount?: number;
  currentYear?: number;
  timeElapsed: number;           // in milliseconds
  estimatedTimeRemaining: number;
  progress: number;              // 0-100
  screenshot?: string;           // base64 encoded
  lastApiCall?: {
    year?: number;
    recordsRequested: number;
    recordsReceived: number;
    offset: number;
    timestamp: number;
  };
  estimatedTotalPapers?: number;
  isEstimating?: boolean;
}
```

### SemanticFilteringProgress (for Step 2)
**Location**: `/home/user/litrevtools/src/frontend/src/components/Step2SemanticFiltering.tsx` (lines 9-28)

```typescript
interface SemanticFilteringProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentTask: string;           // Current activity
  progress: number;
  phase: 'inclusion' | 'exclusion' | 'finalizing';
  totalPapers: number;
  processedPapers: number;
  currentBatch: number;
  totalBatches: number;
  timeElapsed?: number;
  estimatedTimeRemaining?: number;
  error?: string;
  // Real-time status fields
  currentAction?: string;        // ← Enhanced activity tracking
  currentModel?: string;
  healthyKeysCount?: number;
  retryCount?: number;
  keyRotations?: number;
  modelFallbacks?: number;
}
```

### OutputProgress (for Step 3)
**Location**: `/home/user/litrevtools/src/core/types/index.ts` (lines 81-100)

```typescript
export interface OutputProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  stage: 'csv' | 'bibtex' | 'latex' | 'prisma' | 'zip' | 'completed';
  currentTask: string;
  totalStages: number;
  completedStages: number;
  latexBatchProgress?: {
    currentBatch: number;
    totalBatches: number;
    papersInBatch: number;
    papersProcessed: number;
    papersRemaining: number;
    currentDocumentSize: number;
    estimatedFinalSize: number;
  };
  error?: string;
  progress: number;              // 0-100
  timeElapsed?: number;
  estimatedTimeRemaining?: number;
}
```

### BatchProgress Interface
**Location**: `/home/user/litrevtools/src/frontend/src/components/ProgressCard.tsx` (lines 29-37)

```typescript
export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  itemsInBatch?: number;
  itemsProcessed: number;
  itemsRemaining: number;
  currentSize?: number;          // For document size tracking
  estimatedFinalSize?: number;
}
```

---

## 4. Real-time Update Mechanism

### WebSocket/Socket.IO Connection
**Location**: `/home/user/litrevtools/src/frontend/src/hooks/useSocket.ts`

```typescript
export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    // ... connection handlers
  }, []);
};
```

### Progress Hook (Step 1 & 2)
**Location**: `/home/user/litrevtools/src/frontend/src/hooks/useProgress.ts`

**Event Channels**:
```typescript
const progressEvent = `progress:${sessionId}`;
const paperEvent = `paper:${sessionId}`;
const errorEvent = `error:${sessionId}`;
const outputsEvent = `outputs:${sessionId}`;

// Subscribe
socket.emit('subscribe', sessionId);

// Listen for updates
socket.on(progressEvent, progressHandler);
socket.on(paperEvent, paperHandler);
socket.on(errorEvent, errorHandler);
socket.on(outputsEvent, outputsHandler);

// Unsubscribe
socket.emit('unsubscribe', sessionId);
```

### Step 2 Semantic Filtering WebSocket Listeners
**Location**: `/home/user/litrevtools/src/frontend/src/components/Step2SemanticFiltering.tsx` (lines 84-135)

```typescript
const progressEvent = `semantic-filter-progress:${activeSessionId}`;
const completeEvent = `semantic-filter-complete:${activeSessionId}`;

socket.on(progressEvent, handleProgress);      // Real-time progress updates
socket.on(completeEvent, handleComplete);      // Completion event
```

### Step 3 LaTeX Generation WebSocket Listeners
**Location**: `/home/user/litrevtools/src/frontend/src/components/Step3LatexGeneration.tsx` (lines 90-183)

```typescript
const outputProgressEvent = `output-progress:${activeSessionId}`;
const outputsEvent = `outputs:${activeSessionId}`;

socket.on(outputProgressEvent, handleOutputProgress);
socket.on(outputsEvent, handleOutputsGenerated);
```

---

## 5. How Status Updates Flow

### Step 1 Search Flow:
```
User clicks "Search"
    ↓
handleStartSearch() in Step1Search
    ↓
searchAPI.start(params) → Backend starts search
    ↓
WebSocket receives progress:${sessionId} events
    ↓
useProgress hook updates state
    ↓
ProgressDashboard component updates display
    ↓
Shows: Current Task, Next Task, Progress %, Time, Papers
```

### Step 2 Filtering Flow:
```
User clicks "Start Semantic Filtering"
    ↓
handleStartFiltering() in Step2SemanticFiltering
    ↓
axios.post(/api/sessions/${sessionId}/semantic-filter)
    ↓
WebSocket receives semantic-filter-progress:${sessionId}
    ↓
State updates → Component re-renders
    ↓
Shows: Current Task, Progress, Model, Key Rotations, etc.
```

### Step 3 Generation Flow:
```
User clicks "Generate Output"
    ↓
handleStartGeneration() in Step3LatexGeneration
    ↓
sessionAPI.generate(sessionId, dataSource, options)
    ↓
WebSocket receives output-progress:${sessionId}
    ↓
State updates → Component re-renders
    ↓
Shows: Stage, Batch Progress, Document Size, etc.
```

---

## 6. Real-time Status Details (Step 2 Example)

**Location**: `/home/user/litrevtools/src/frontend/src/components/Step2SemanticFiltering.tsx` (lines 482-524)

Currently displays in a grid:
- Current Model
- Healthy Keys (number of working API keys)
- Retries (count)
- Key Rotations (count)
- Model Fallbacks (count)
- Current Action (if different from current task)

This is the foundation for expanded "Activity Blocks" that could show:
- Previous Activity (last completed action)
- Current Activity (what's happening now)
- Next Activity (what comes next)

---

## Implementation Blueprint for Activity Blocks

To implement "Activity Blocks" in Step 3, you would need to:

### 1. Extend OutputProgress Type
Add to `/home/user/litrevtools/src/core/types/index.ts`:
```typescript
export interface OutputProgress {
  // ... existing fields
  previousStage?: string;        // New: Track previous stage
  previousTask?: string;         // New: Track previous task
  nextStage?: string;           // New: Planned next stage
  activityLog?: {               // New: Activity history
    timestamp: number;
    action: string;
    stage: string;
    details?: any;
  }[];
  currentActivityDetails?: {    // New: Enhanced current activity
    startedAt: number;
    estimatedDuration?: number;
    substeps?: {
      current: number;
      total: number;
      description: string;
    };
  };
}
```

### 2. Create ActivityBlock Component
New file: `/home/user/litrevtools/src/frontend/src/components/ActivityBlock.tsx`
```tsx
interface ActivityBlockProps {
  title: "Previous Activity" | "Current Activity" | "Next Activity";
  status?: "idle" | "running" | "completed" | "error";
  content: string;
  timestamp?: number;
  details?: Record<string, any>;
}

export const ActivityBlock: React.FC<ActivityBlockProps> = ({...}) => {
  // Similar styling to ProgressDashboard's Current/Next Task blocks
  // Color coded based on status
  // Shows details in expandable section
}
```

### 3. Update Step 3 Component
Modify `/home/user/litrevtools/src/frontend/src/components/Step3LatexGeneration.tsx`:
```tsx
// Track activity history
const [activityHistory, setActivityHistory] = useState<Activity[]>([]);
const [currentActivity, setCurrentActivity] = useState<Activity | null>(null);

// Update handlers
const handleOutputProgress = (progress: OutputProgress) => {
  // Log activity transitions
  if (progress.stage !== previousStage) {
    addActivityLog(previousStage, progress.stage);
  }
  setCurrentActivity({
    stage: progress.stage,
    task: progress.currentTask,
    startTime: Date.now()
  });
};

// Render activity blocks
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <ActivityBlock 
    title="Previous Activity"
    status={activityHistory[-2]?.status}
    content={activityHistory[-2]?.content}
  />
  <ActivityBlock 
    title="Current Activity"
    status="running"
    content={currentActivity?.task}
    details={currentActivity?.details}
  />
  <ActivityBlock 
    title="Next Activity"
    status="pending"
    content={getNextActivityDescription()}
  />
</div>
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/frontend/src/components/Step1Search.tsx` | Step 1 UI component |
| `src/frontend/src/components/Step2SemanticFiltering.tsx` | Step 2 UI component |
| `src/frontend/src/components/Step3LatexGeneration.tsx` | Step 3 UI component (needs activity blocks) |
| `src/frontend/src/components/ProgressDashboard.tsx` | Main progress display (Current/Next Task blocks) |
| `src/frontend/src/components/ProgressCard.tsx` | Reusable progress card |
| `src/frontend/src/hooks/useSocket.ts` | WebSocket connection |
| `src/frontend/src/hooks/useProgress.ts` | Progress state management |
| `src/frontend/src/types/index.ts` | TypeScript interfaces (frontend) |
| `src/core/types/index.ts` | TypeScript interfaces (core/backend) |
| `src/platforms/web/server.ts` | WebSocket event broadcasting |

