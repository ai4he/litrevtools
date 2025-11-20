# Activity Blocks Quick Reference

## Summary

Activity blocks are **NOT YET IMPLEMENTED**. The codebase has a **solid foundation** for implementing them, with existing components already displaying similar "Current Task" and "Next Task" activity information.

---

## Files to Examine (In Order)

1. **Read this first:**
   - `/home/user/litrevtools/src/frontend/src/components/ProgressDashboard.tsx` (lines 184-194)
   - Shows the existing "Current Task" and "Next Task" blocks (closest to activity blocks)

2. **Understand the data flow:**
   - `/home/user/litrevtools/src/frontend/src/hooks/useSocket.ts` (WebSocket connection)
   - `/home/user/litrevtools/src/frontend/src/hooks/useProgress.ts` (Event listeners)

3. **See advanced tracking:**
   - `/home/user/litrevtools/src/frontend/src/components/Step2SemanticFiltering.tsx` (lines 482-524)
   - Shows real-time status details (Current Model, Key Rotations, etc.)

4. **View Step 3 (needs activity blocks):**
   - `/home/user/litrevtools/src/frontend/src/components/Step3LatexGeneration.tsx`
   - Lines 90-183: WebSocket listener setup
   - Lines 196-299: Progress update handling

---

## Key Components & Their Roles

### ProgressDashboard.tsx (Step 1)
```
Lines 184-194: Current Task & Next Task blocks
├─ Shows progress.currentTask (blue background)
├─ Shows progress.nextTask (purple background)
└─ Updates via ProgressUpdate interface
```

### ProgressCard.tsx (Steps 2 & 3)
```
Used for inline progress during filtering/generation
├─ Shows currentTask
├─ Shows progress percentage (0-100)
├─ Shows batch progress (optional)
└─ Supports loading spinner and error states
```

### Step2SemanticFiltering.tsx (Enhanced Activity Tracking)
```
Lines 482-524: Real-time Status Details
├─ Displays Current Model
├─ Displays Healthy Keys count
├─ Displays Retries
├─ Displays Key Rotations
├─ Displays Model Fallbacks
└─ Displays Current Action (if different from current task)

This is the best example of extended activity tracking
```

---

## Data Structures

### ProgressUpdate (Step 1)
```typescript
{
  currentTask: string,        // Current activity description
  nextTask: string,           // Next planned activity
  status: 'running',          // idle | running | paused | completed | error
  progress: 45,               // 0-100
  timeElapsed: 120000,        // milliseconds
  estimatedTimeRemaining: 60000
}
```

### SemanticFilteringProgress (Step 2)
```typescript
{
  currentTask: string,        // Current activity
  currentAction?: string,     // Enhanced: specific action
  status: 'running',
  phase: 'inclusion',         // inclusion | exclusion | finalizing
  currentModel?: string,      // Which LLM model is active
  keyRotations?: number,      // How many times API key rotated
  progress: 66
}
```

### OutputProgress (Step 3)
```typescript
{
  currentTask: string,
  stage: 'latex',             // csv | bibtex | latex | prisma | zip
  status: 'running',
  latexBatchProgress: {
    currentBatch: 3,
    totalBatches: 10,
    papersProcessed: 45,
    papersRemaining: 55
  },
  progress: 30
}
```

---

## WebSocket Events

### Event Naming Pattern
```
${EVENT_TYPE}:${sessionId}

Examples:
- progress:abc123def456
- paper:abc123def456
- error:abc123def456
- semantic-filter-progress:abc123def456
- semantic-filter-complete:abc123def456
- output-progress:abc123def456
- outputs:abc123def456
```

### How Components Listen

Step 1 (via useProgress hook):
```typescript
socket.on(`progress:${sessionId}`, handleProgress);
```

Step 2 (direct listeners):
```typescript
socket.on(`semantic-filter-progress:${sessionId}`, handleProgress);
socket.on(`semantic-filter-complete:${sessionId}`, handleComplete);
```

Step 3 (direct listeners):
```typescript
socket.on(`output-progress:${sessionId}`, handleOutputProgress);
socket.on(`outputs:${sessionId}`, handleOutputsGenerated);
```

---

## Existing Code Patterns

### Pattern 1: Current/Next Task Blocks (ProgressDashboard.tsx)
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
    <h4 className="text-sm font-semibold text-blue-900 mb-2">Current Task</h4>
    <p className="text-sm text-blue-800">{progress.currentTask}</p>
  </div>
  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
    <h4 className="text-sm font-semibold text-purple-900 mb-2">Next Task</h4>
    <p className="text-sm text-purple-800">{progress.nextTask}</p>
  </div>
</div>
```

### Pattern 2: Status Grid (Step2SemanticFiltering.tsx)
```jsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
  <div className="bg-white p-2 rounded shadow-sm">
    <div className="text-gray-500 font-medium">Current Model</div>
    <div className="text-gray-900 font-mono">{progress.currentModel}</div>
  </div>
  <div className="bg-white p-2 rounded shadow-sm">
    <div className="text-gray-500 font-medium">Healthy Keys</div>
    <div className="text-green-600 font-bold">{progress.healthyKeysCount}</div>
  </div>
  {/* More status items */}
</div>
```

### Pattern 3: WebSocket Listener Setup
```typescript
useEffect(() => {
  if (!socket || !sessionId) return;
  
  // Subscribe to updates
  socket.emit('subscribe', sessionId);
  
  // Listen for events
  const eventName = `event-type:${sessionId}`;
  socket.on(eventName, (data) => {
    console.log('Received:', data);
    setState(data);
  });
  
  // Cleanup
  return () => {
    socket.off(eventName);
    socket.emit('unsubscribe', sessionId);
  };
}, [socket, sessionId]);
```

---

## How to Implement Activity Blocks

### Step 1: Create ActivityBlock Component
```typescript
// File: src/frontend/src/components/ActivityBlock.tsx
export interface ActivityBlockProps {
  title: "Previous Activity" | "Current Activity" | "Next Activity";
  status: "idle" | "running" | "completed" | "error" | "pending";
  content: string;
  details?: Record<string, any>;
  timestamp?: number;
}

export const ActivityBlock: React.FC<ActivityBlockProps> = ({
  title,
  status,
  content,
  details
}) => {
  // Determine colors based on status
  const colors = {
    idle: 'bg-gray-50 text-gray-900',
    pending: 'bg-yellow-50 text-yellow-900',
    running: 'bg-blue-50 text-blue-900',
    completed: 'bg-green-50 text-green-900',
    error: 'bg-red-50 text-red-900'
  };
  
  return (
    <div className={`p-4 rounded-lg border ${colors[status]}`}>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <p className="text-sm">{content}</p>
      {details && <pre>{JSON.stringify(details, null, 2)}</pre>}
    </div>
  );
};
```

### Step 2: Track Activity in Step 3
```typescript
const [previousActivity, setPreviousActivity] = useState<string>('');
const [currentActivity, setCurrentActivity] = useState<string>('');
const [nextActivity, setNextActivity] = useState<string>('');

const handleOutputProgress = (progress: OutputProgress) => {
  // Update activity when stage changes
  if (progress.stage !== previousStage) {
    setPreviousActivity(previousStage);
    setCurrentActivity(progress.stage);
    setNextActivity(getNextStage(progress.stage));
  }
};
```

### Step 3: Render in UI
```jsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
  <ActivityBlock
    title="Previous Activity"
    status={previousActivity ? "completed" : "idle"}
    content={previousActivity || "None"}
  />
  <ActivityBlock
    title="Current Activity"
    status="running"
    content={currentActivity}
    details={outputProgress?.latexBatchProgress}
  />
  <ActivityBlock
    title="Next Activity"
    status="pending"
    content={nextActivity || "Pending"}
  />
</div>
```

---

## Testing Checklist

When implementing activity blocks:

- [ ] Component renders without errors
- [ ] Receives WebSocket updates in real-time
- [ ] Status colors change appropriately
- [ ] Activity transitions are logged
- [ ] Cleans up listeners on unmount
- [ ] Works with CSV upload (tempSessionId)
- [ ] Works with Step 2 data (sessionId from props)
- [ ] Error state displays correctly
- [ ] Responsive on mobile screens
- [ ] No console errors in browser dev tools

---

## Related Documentation

- `ACTIVITY_BLOCKS_ANALYSIS.md` - Detailed analysis of current implementation
- `ACTIVITY_BLOCKS_ARCHITECTURE.md` - Visual architecture diagrams
- `CLAUDE.md` - Project overview and architecture
- `LLM_FILTERING.md` - Details on Step 2 semantic filtering
- `DEPLOYMENT.md` - Production deployment guide

---

## Common Issues & Solutions

### Issue: Activity blocks not updating
**Solution**: Check that WebSocket is connected and event names match session ID

### Issue: Previous activity always empty
**Solution**: Initialize state with empty string and update in handleOutputProgress callback

### Issue: Colors not showing
**Solution**: Ensure Tailwind CSS classes are properly configured in tailwind.config.js

### Issue: Events not received
**Solution**: Verify socket.emit('subscribe', sessionId) is called in useEffect

---

## Performance Tips

1. Use `useCallback` for event handlers to prevent re-renders
2. Memoize ActivityBlock component if rendering multiple instances
3. Don't log all WebSocket events to console in production
4. Throttle progress updates if receiving too frequently
5. Clean up event listeners properly in useEffect cleanup function

