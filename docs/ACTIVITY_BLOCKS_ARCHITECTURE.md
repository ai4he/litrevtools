# Activity Blocks Architecture Diagram

## Current Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Step1Search.tsx          Step2SemanticFiltering.tsx   Step3LaTeX...tsx │
│  │                        │                            │                │
│  └─> useProgress hook     └─> WebSocket listeners      └─> WebSocket   │
│      │                        │                            listeners   │
│      │                        ├─ semantic-filter-progress:${sessionId} │
│      │                        └─ semantic-filter-complete:${sessionId} │
│      │                                                                  │
│      └─ progress:${sessionId}                        output-progress:${sessionId}
│         paper:${sessionId}                           outputs:${sessionId}
│         error:${sessionId}                                              │
│         outputs:${sessionId}                                            │
│                            │                            │               │
│                            └────────────────────────────┴───────────────┘
│                                           │
│                                           ▼
│                            ProgressDashboard.tsx (Step 1 only)
│                            ProgressCard.tsx (Steps 2 & 3)
│                            │
│                            ├─ Current Task block (lines 184-189)
│                            ├─ Next Task block (lines 190-193)
│                            ├─ Progress bar (lines 168-182)
│                            ├─ Time info (lines 196-227)
│                            └─ Statistics grid (lines 275-299)
│
│  DATA STRUCTURES (from props/state):
│
│  Step 1: ProgressUpdate
│  ├─ currentTask: string
│  ├─ nextTask: string
│  ├─ status: 'running' | 'paused' | 'completed' | 'error'
│  ├─ progress: 0-100
│  ├─ timeElapsed: milliseconds
│  └─ estimatedTimeRemaining: milliseconds
│
│  Step 2: SemanticFilteringProgress
│  ├─ currentTask: string
│  ├─ currentAction?: string (enhanced tracking)
│  ├─ status: 'idle' | 'running' | 'completed' | 'error'
│  ├─ phase: 'inclusion' | 'exclusion' | 'finalizing'
│  ├─ currentModel?: string
│  ├─ keyRotations?: number
│  └─ progress: 0-100
│
│  Step 3: OutputProgress
│  ├─ currentTask: string
│  ├─ stage: 'csv' | 'bibtex' | 'latex' | 'prisma' | 'zip'
│  ├─ status: 'idle' | 'running' | 'completed' | 'error'
│  ├─ latexBatchProgress: { ... batch details ... }
│  └─ progress: 0-100
│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket
                                    │ Socket.IO
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  src/platforms/web/server.ts                                            │
│  │                                                                       │
│  ├─ Socket.IO Server                                                    │
│  │  ├─ subscribe(sessionId)                                             │
│  │  ├─ unsubscribe(sessionId)                                           │
│  │  └─ Broadcast handlers                                              │
│  │                                                                       │
│  ├─ HTTP Routes                                                         │
│  │  ├─ POST /api/search/start → searchAPI.start()                      │
│  │  ├─ POST /api/sessions/:sessionId/semantic-filter → Filter logic    │
│  │  └─ POST /api/sessions/:sessionId/generate → Output generation      │
│  │                                                                       │
│  └─ Event Broadcasting                                                  │
│     ├─ socket.emit('progress:${sessionId}', progressData)              │
│     ├─ socket.emit('semantic-filter-progress:${sessionId}', ...)       │
│     └─ socket.emit('output-progress:${sessionId}', ...)                │
│                                                                           │
│  Core Business Logic (src/core/)                                        │
│  ├─ scholar/index.ts → Paper extraction                                 │
│  ├─ llm/llm-service.ts → Semantic filtering                             │
│  └─ outputs/latex-generator.ts → Output generation                      │
│                                                                           │
│  Database (SQLite)                                                       │
│  ├─ sessions                                                             │
│  ├─ papers                                                               │
│  ├─ prisma_data                                                          │
│  └─ output_files                                                         │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy for Activity Display

### Step 1: Full Hierarchy
```
Step1Search
├─ SearchForm (user input)
├─ ProgressDashboard (real-time display)
│  ├─ Status Header (with icon)
│  ├─ Progress Bar
│  ├─ Current Task Block ◄─── SIMILAR TO ACTIVITY BLOCK
│  │   └─ Blue background, shows: progress.currentTask
│  ├─ Next Task Block ◄─────── SIMILAR TO ACTIVITY BLOCK
│  │   └─ Purple background, shows: progress.nextTask
│  ├─ Time Information Grid
│  │  ├─ Time Elapsed
│  │  ├─ Estimated Remaining
│  │  └─ Current Year
│  ├─ Paper Date Range
│  └─ Statistics Grid (5 columns)
│     ├─ Total Papers
│     ├─ Included
│     ├─ Excluded
│     ├─ Processed
│     └─ Duplicates
└─ PaperList (scrollable paper items)
```

### Step 2: Activity Status Section
```
Step2SemanticFiltering
├─ Data Source Selection (radio buttons)
├─ LLM Configuration (dropdowns & textareas)
├─ Start Button
└─ DURING FILTERING:
   ├─ ProgressCard
   │  ├─ Spinner + Title
   │  ├─ Current Task
   │  ├─ Progress Bar (0-100%)
   │  └─ Batch Progress Grid
   │     ├─ Current Batch N/M
   │     ├─ Items Processed
   │     └─ Items Remaining
   │
   └─ Real-time Status Details ◄─── FOUNDATION FOR ACTIVITY BLOCKS
      └─ Grid Display (lines 482-524)
         ├─ Current Model
         ├─ Healthy Keys
         ├─ Retries
         ├─ Key Rotations
         ├─ Model Fallbacks
         └─ Current Action (if different from currentTask)
```

### Step 3: Foundation for Activity Blocks
```
Step3LatexGeneration
├─ Configuration Section
├─ Start Button
└─ DURING GENERATION:
   ├─ ProgressCard
   │  ├─ Current Task
   │  ├─ Progress Bar
   │  └─ Batch Progress (Stage info)
   │
   └─ [FUTURE: Activity Blocks Section]
      ├─ Previous Activity Block
      │  ├─ Title: "Previous Activity"
      │  ├─ Status badge
      │  └─ Content: last completed stage
      │
      ├─ Current Activity Block
      │  ├─ Title: "Current Activity"
      │  ├─ Status badge (running)
      │  ├─ Content: current stage
      │  └─ Details: batch progress, timing
      │
      └─ Next Activity Block
         ├─ Title: "Next Activity"
         ├─ Status badge (pending)
         └─ Content: next stage description
```

---

## State Management Flow

### WebSocket Event Sequence (Example: Step 2 Filtering)

```
TIME  │ FRONTEND                 │ WEBSOCKET EVENT              │ BACKEND
──────┼──────────────────────────┼──────────────────────────────┼──────────────
T1    │ User clicks button       │                              │
      │ state: useFiltering=true │                              │
      │                          │                              │
T2    │                          │ POST /api/.../semantic-filter│ Processing
      │                          │                              │
T3    │                          │ semantic-filter-progress     │ Phase 1/3:
      │ receive progress event   │ {progress: 33%, phase:       │ Inclusion
      │ state: progress updated  │  inclusion, batch: 1/5}      │
      │ component re-renders     │                              │
      │                          │                              │
T4    │ ProgressCard shows:      │                              │
      │ "Processing batch 1/5"   │                              │
      │ Progress: 33%            │                              │
      │                          │                              │
T5    │                          │ semantic-filter-progress     │ Phase 2/3:
      │ receive progress event   │ {progress: 66%, phase:       │ Exclusion
      │ state: progress updated  │  exclusion, batch: 3/5}      │
      │ component re-renders     │                              │
      │                          │                              │
T6    │ ProgressCard shows:      │                              │
      │ "Processing batch 3/5"   │                              │
      │ Progress: 66%            │                              │
      │                          │                              │
T7    │                          │ semantic-filter-complete     │ Done
      │ receive completion event │ {papers: [...]}              │
      │ state: isFiltering=false │                              │
      │ state: progress=null     │                              │
      │ component re-renders     │                              │
      │                          │                              │
T8    │ Completion message       │                              │
      │ Download button enabled  │                              │
```

---

## Key Insights for Activity Blocks Implementation

### 1. Existing Pattern (Step 1)
The `ProgressDashboard` already shows "Current Task" and "Next Task" in separate blocks:
- Located at **lines 184-194** of `ProgressDashboard.tsx`
- Styled with colored backgrounds (blue for current, purple for next)
- Could be extracted into a reusable `ActivityBlock` component

### 2. Enhanced Status Tracking (Step 2)
The `SemanticFilteringProgress` interface includes extended fields:
- `currentAction?: string` - Allows showing what's currently happening
- `currentModel?: string` - Shows which AI model is in use
- `keyRotations?: number` - Tracks API key rotation events
- This could be extended to track activity transitions

### 3. Batch Processing Context (Step 3)
The `OutputProgress` includes:
- `latexBatchProgress` - Detailed batch-level tracking
- `stage` field - Clear stage transitions (csv → bibtex → latex → prisma → zip)
- Perfect for showing "Previous → Current → Next" activity blocks

### 4. Real-time Update Mechanism
All components use WebSocket listeners that:
- Subscribe to session updates on mount
- Listen for specific event channels: `semantic-filter-progress:${sessionId}`
- Unsubscribe on unmount (cleanup)
- This architecture supports frequent updates needed for activity tracking

---

## Proposed Activity Block Component Interface

Based on the analysis, here's what the new component should support:

```typescript
interface ActivityBlock {
  // Identification
  id: string;
  title: "Previous Activity" | "Current Activity" | "Next Activity";
  
  // Status
  status: "idle" | "running" | "completed" | "error" | "pending";
  
  // Content
  content: string;                    // Main description
  details?: Record<string, any>;      // Additional info (batch #, timing, etc.)
  
  // Timing
  startTime?: number;                 // ISO timestamp
  duration?: number;                  // milliseconds
  
  // Visual
  icon?: ReactNode;
  color?: string;                     // CSS color class
  animated?: boolean;                 // For "Current Activity"
}
```

---

## Integration Points

To implement activity blocks in Step 3, you would:

1. **Track activity history in state**
   ```tsx
   const [activityLog, setActivityLog] = useState<ActivityBlock[]>([]);
   ```

2. **Update on progress changes**
   ```tsx
   const handleOutputProgress = (progress: OutputProgress) => {
     if (progress.stage !== currentStage) {
       // Stage changed - add to history
       addToActivityLog(currentStage, progress.stage);
     }
     setCurrentActivity({...});
     setNextActivity({...});
   };
   ```

3. **Render in UI**
   ```tsx
   <div className="grid grid-cols-3 gap-4">
     <ActivityBlock block={previousActivity} />
     <ActivityBlock block={currentActivity} />
     <ActivityBlock block={nextActivity} />
   </div>
   ```

4. **Leverage existing infrastructure**
   - Use `useSocket()` hook for WebSocket connection
   - Extend `OutputProgress` type for enhanced tracking
   - Follow styling patterns from `ProgressDashboard`
   - Reuse color schemes and spacing from Tailwind config
