# LitRevTools - Unified Platform Architecture

## Overview

LitRevTools is built as a **true isomorphic application** with a single codebase that runs across multiple platforms:

- 🌐 **Web Application** (Browser)
- 💻 **Desktop Application** (Windows, macOS, Linux via Electron)
- 📱 **Mobile Application** (iOS, Android via Capacitor)
- ⌨️ **Command-Line Interface** (CLI)

## Architecture Principles

### 1. Shared Business Logic (`src/core/`)

All core functionality is platform-agnostic and shared across all platforms:

```
src/core/
├── database/         # SQLite database operations
├── scholar/          # Google Scholar scraping engine
├── gemini/           # AI-powered paper generation
├── outputs/          # Multi-format output generators
└── types/            # Shared TypeScript interfaces
```

**Key Features**:
- No platform-specific code
- Pure business logic
- Can run in Node.js or browser contexts
- Thoroughly tested and reliable

### 2. Shared User Interface (`src/frontend/`)

A **single React application** serves all GUI platforms:

```
src/frontend/
├── src/
│   ├── components/   # Reusable UI components
│   ├── pages/        # Application pages
│   ├── hooks/        # Custom React hooks
│   ├── utils/        # Helper functions
│   ├── types/        # Frontend TypeScript types
│   └── styles/       # Global styles (Tailwind CSS)
├── package.json      # Frontend dependencies
└── vite.config.ts    # Build configuration
```

**Technology Stack**:
- React 18 with TypeScript
- Tailwind CSS for styling
- Vite for fast builds
- Socket.IO Client for real-time updates
- Google OAuth for authentication

### 3. Platform-Specific Wrappers (`src/platforms/`)

Thin wrappers that adapt the shared code to each platform:

```
src/platforms/
├── web/              # Express.js web server
├── desktop/          # Electron wrapper
├── mobile/           # Capacitor wrapper
└── cli/              # Command-line interface
```

## Platform Details

### Web Platform (`src/platforms/web/`)

**Purpose**: HTTP/WebSocket server that serves the React frontend and provides REST API

**Components**:
- `server.ts` - Express.js server with Socket.IO
- `auth.ts` - Google OAuth 2.0 + JWT authentication
- `public/` - Static fallback files

**How it works**:
1. Compiles TypeScript backend to `dist/platforms/web/`
2. Builds React frontend to `dist/frontend/dist/`
3. Express serves the frontend and exposes REST API
4. Socket.IO provides real-time updates during searches

**Run Commands**:
```bash
# Development
npm run web:dev          # Start backend
npm run frontend:dev     # Start frontend dev server

# Production
npm run web:build        # Build everything
npm run web:start        # Start production server
```

**Access**: `http://localhost:3000`

---

### Desktop Platform (`src/platforms/desktop/`)

**Purpose**: Native desktop application using Electron

**Components**:
- `main.ts` - Electron main process (Node.js)
- `preload.ts` - Secure IPC bridge

**How it works**:
1. Electron creates a native window
2. Loads the **same React frontend** from `dist/frontend/dist/`
3. Uses IPC for communication between renderer and main process
4. Runs core logic directly in Node.js (no HTTP server needed)

**Run Commands**:
```bash
# Development (loads from Vite dev server)
npm run desktop:dev

# Production (creates installers)
npm run desktop:build
```

**Output**: Platform-specific installers in `build/` directory:
- Windows: `.exe` installer
- macOS: `.dmg` installer
- Linux: `.AppImage`

---

### Mobile Platform (`src/platforms/mobile/`)

**Purpose**: Native mobile apps for iOS and Android using Capacitor

**Components**:
- `index.ts` - Mobile API bridge
- `capacitor.config.json` - Capacitor configuration

**How it works**:
1. Capacitor wraps the **same React frontend** in a WebView
2. Provides native device APIs (camera, filesystem, etc.)
3. Communicates with backend server via HTTP/WebSocket
4. Can bundle frontend for offline use

**Run Commands**:
```bash
# Development
npm run mobile:sync           # Sync frontend to native projects
npm run mobile:run:android    # Run on Android
npm run mobile:run:ios        # Run on iOS (macOS only)

# Production
npm run mobile:build          # Build and sync
```

**Output**: Native apps that can be published to app stores

---

### CLI Platform (`src/platforms/cli/`)

**Purpose**: Command-line interface for automation and scripting

**Components**:
- `index.ts` - Commander.js CLI application

**How it works**:
1. Parses command-line arguments
2. Directly calls core functionality
3. Displays progress with CLI progress bars
4. Outputs files to specified directory

**Run Commands**:
```bash
npm run cli -- search \
  --include "large language model" \
  --exclude "survey" \
  --start-year 2020 \
  --output ./results
```

---

## Data Flow

### Web & Mobile (HTTP/WebSocket)

```
┌─────────────┐
│  React UI   │ ← Shared Frontend (src/frontend/)
└──────┬──────┘
       │ HTTP REST API
       │ WebSocket (Socket.IO)
       ↓
┌──────────────┐
│ Express.js   │ ← Web Platform (src/platforms/web/)
└──────┬───────┘
       │ Direct function calls
       ↓
┌──────────────┐
│  Core Logic  │ ← Shared Business Logic (src/core/)
└──────────────┘
```

### Desktop (IPC)

```
┌─────────────┐
│  React UI   │ ← Shared Frontend (src/frontend/)
│ (Renderer)  │
└──────┬──────┘
       │ IPC (Inter-Process Communication)
       ↓
┌──────────────┐
│ Electron     │ ← Desktop Platform (src/platforms/desktop/)
│ (Main)       │
└──────┬───────┘
       │ Direct function calls
       ↓
┌──────────────┐
│  Core Logic  │ ← Shared Business Logic (src/core/)
└──────────────┘
```

### CLI (Direct)

```
┌──────────────┐
│  Commander   │ ← CLI Platform (src/platforms/cli/)
└──────┬───────┘
       │ Direct function calls
       ↓
┌──────────────┐
│  Core Logic  │ ← Shared Business Logic (src/core/)
└──────────────┘
```

---

## Build Process

### Development Workflow

```bash
# 1. Install all dependencies
npm install                  # Root dependencies
npm run frontend:install     # Frontend dependencies

# 2. Start development
# Option A: Web
npm run web:dev             # Terminal 1: Backend
npm run frontend:dev        # Terminal 2: Frontend

# Option B: Desktop
npm run frontend:dev        # Terminal 1: Frontend
npm run desktop:dev         # Terminal 2: Electron

# Option C: Mobile
npm run mobile:sync         # Sync once
# Then use native IDE (Xcode/Android Studio)
```

### Production Build

```bash
# Web Application
npm run web:build           # Builds: frontend + backend
npm run web:start           # Runs production server

# Desktop Application
npm run desktop:build       # Creates native installers

# Mobile Application
npm run mobile:build        # Prepares for native build
```

### Build Outputs

```
dist/                        # Compiled TypeScript
├── core/                   # Compiled core logic
├── platforms/              # Compiled platform code
└── frontend/               # Compiled React app
    └── dist/               # Vite build output

build/                      # Electron installers
├── LitRevTools-1.0.0.dmg  # macOS
├── LitRevTools-1.0.0.exe  # Windows
└── LitRevTools-1.0.0.AppImage  # Linux

android/                    # Android project (Capacitor)
ios/                        # iOS project (Capacitor)
```

---

## Code Sharing Benefits

### ✅ Advantages

1. **Single Source of Truth**
   - Update once, works everywhere
   - Consistent UI/UX across platforms
   - Shared bug fixes

2. **Reduced Maintenance**
   - No duplicate code
   - One set of tests
   - One documentation

3. **Faster Development**
   - Write once, deploy everywhere
   - Reuse components and logic
   - Parallel development possible

4. **Type Safety**
   - TypeScript across entire stack
   - Shared interfaces
   - Compile-time error checking

### 🎯 Trade-offs

1. **Platform-Specific Features**
   - Must be abstracted or conditionally loaded
   - Some features may not work on all platforms
   - Requires careful API design

2. **Build Complexity**
   - Multiple build targets
   - Platform-specific dependencies
   - Requires understanding of all platforms

3. **Bundle Size**
   - Shared code includes all platform logic
   - May include unused code on some platforms
   - Requires careful code splitting

---

## Adding New Features

When adding a new feature, follow this pattern:

### 1. Core Logic (if needed)

Add to `src/core/` if the feature requires new business logic:

```typescript
// src/core/my-feature/index.ts
export class MyFeature {
  async doSomething() {
    // Platform-agnostic logic
  }
}
```

### 2. Frontend UI

Add to `src/frontend/` for UI components:

```typescript
// src/frontend/src/components/MyComponent.tsx
export const MyComponent: React.FC = () => {
  return <div>New Feature</div>;
};
```

### 3. Platform Integration

Add to platform-specific files as needed:

```typescript
// src/platforms/web/server.ts
app.post('/api/my-feature', async (req, res) => {
  const feature = new MyFeature();
  const result = await feature.doSomething();
  res.json({ result });
});

// src/platforms/desktop/main.ts
ipcMain.handle('my-feature', async () => {
  const feature = new MyFeature();
  return await feature.doSomething();
});
```

---

## Testing Strategy

### Unit Tests
- Test core logic in isolation
- Mock platform-specific code
- Run with Jest

### Integration Tests
- Test platform wrappers
- Ensure correct API contracts
- Test real database operations

### E2E Tests
- Test complete workflows
- Use Playwright for web
- Use Spectron for desktop
- Use Appium for mobile

---

## Deployment

### Web Application

1. Build: `npm run web:build`
2. Deploy `dist/` to server
3. Configure reverse proxy (Nginx/Apache)
4. Set environment variables
5. Use PM2 for process management

### Desktop Application

1. Build: `npm run desktop:build`
2. Distribute installers from `build/`
3. Optional: Use auto-updater (Electron)
4. Optional: Code signing for macOS/Windows

### Mobile Application

1. Build: `npm run mobile:build`
2. Open in Xcode (iOS) or Android Studio (Android)
3. Build native apps
4. Submit to app stores
5. Configure deep linking and push notifications

---

## Future Enhancements

### Planned Features
- [ ] Offline mode for mobile/desktop
- [ ] Cloud sync across devices
- [ ] Collaborative features (shared searches)
- [ ] Advanced visualizations
- [ ] PDF viewer integration
- [ ] Reference management integration

### Platform-Specific Enhancements
- **Web**: PWA support, service workers
- **Desktop**: Native notifications, system tray
- **Mobile**: Share extensions, widgets
- **CLI**: Interactive mode, plugins

---

## Summary

LitRevTools demonstrates a **true isomorphic architecture**:

- ✅ **One Codebase** - Write once, run everywhere
- ✅ **Shared Core** - Business logic works on all platforms
- ✅ **Unified UI** - Same React app on web, desktop, mobile
- ✅ **Platform Wrappers** - Thin adapters for each platform
- ✅ **Type Safe** - TypeScript end-to-end
- ✅ **Maintainable** - Single source of truth

This architecture maximizes code reuse while maintaining platform-specific optimizations where needed.
