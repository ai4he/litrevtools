# LitRevTools Web Interface

A modern, AI-powered web application for conducting systematic literature reviews using the PRISMA methodology.

## Features

### 🔐 **Google OAuth Authentication**
- Secure sign-in with Google accounts
- JWT-based session management
- Protected API endpoints

### 🔍 **Advanced Search Configuration**
- **Custom Search Names**: Auto-generated or user-defined
- **Inclusion Keywords**: Required keywords with suggestions ("large language model", "mathematical reasoning")
- **Exclusion Keywords**: Optional filters with suggestions ("survey", "review")
- **Date Range Filtering**: Optional start and end years
- **Result Limits**: Configurable maximum results (infinite by default)

### 📊 **Real-Time Progress Tracking**
- **Live Progress Bar**: Visual representation of search completion
- **Status Updates**: Current task and next task information
- **Time Tracking**: Elapsed time and estimated remaining time
- **Statistics Dashboard**:
  - Total papers found
  - Included papers count
  - Excluded papers count
  - Papers processed

### 🖼️ **Live Browser Screenshots**
- View real-time screenshots from the headless browser
- Expandable full-screen view
- Automatic updates during scraping

### 📄 **Paper Management**
- **Real-time Paper List**: Papers appear as they're discovered
- **Filtering**: View all, included, or excluded papers
- **Detailed Information**:
  - Title, authors, year
  - Abstract and citations
  - DOI and venue
  - Exclusion reasons (for filtered papers)
- **Expandable Details**: Click to view full paper information

### 📦 **Progressive Output Downloads**
Available during and after the search:
- **CSV File**: Paper data in spreadsheet format
- **BibTeX File**: References for LaTeX documents
- **LaTeX Paper**: Full research paper with PRISMA diagrams
- **ZIP Archive**: Complete package with all outputs

### 🤖 **AI-Powered Paper Generation**
- Automatic generation of PRISMA systematic review sections:
  - Abstract
  - Introduction
  - Methodology
  - Results
  - Discussion
  - Conclusion
- PRISMA flow diagrams and tables

## Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Tailwind CSS
- **Real-time**: Socket.IO Client
- **Authentication**: @react-oauth/google
- **Icons**: Lucide React

### Backend
- **Server**: Express.js with Socket.IO
- **Authentication**: Google OAuth 2.0 + JWT
- **Database**: SQLite (via better-sqlite3)
- **Web Scraping**: Puppeteer with stealth plugin
- **AI Integration**: Google Gemini API
- **Anonymity**: Tor circuit rotation support

## Setup Instructions

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies (shared across web, desktop, and mobile)
npm run frontend:install
```

**Note**: The frontend is now unified and shared across all platforms (web, desktop, mobile).

### 2. Configure Environment Variables

Create a `.env` file from the template and configure your credentials:

```bash
# Copy the example file
cp .env.example .env

# Edit the .env file with your credentials
nano .env
```

Required configuration:

```bash
# Google OAuth - Get from Google Cloud Console
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# JWT Secret (CHANGE IN PRODUCTION!)
JWT_SECRET=litrevtools-secret-key-change-in-production

# Gemini API (required for AI features)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest

# Server Configuration
WEB_PORT=3000
WEB_HOST=localhost

# Database
DATABASE_PATH=./data/litrevtools.db
OUTPUT_DIR=./data/outputs

# Optional: Tor Configuration
TOR_SOCKS_PORT=9050
TOR_CONTROL_PORT=9051
```

#### Getting Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure the OAuth consent screen
6. Set application type to "Web application"
7. Add authorized redirect URIs:
   - `http://localhost:3000` (for development)
   - Your production domain (e.g., `https://yourdomain.com`)
8. Copy the Client ID and Client Secret to your `.env` file

**Important**:
- Update the `GEMINI_API_KEY` with your actual API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with your Google OAuth credentials
- Change `JWT_SECRET` to a strong random string in production

#### Frontend Environment Configuration

The frontend also needs the Google Client ID. Create a `.env` file in the shared frontend directory:

```bash
cd src/frontend
cp .env.example .env
# Edit and add your Google Client ID (same as backend)
nano .env
```

The frontend `.env` should contain:
```bash
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

Note: The Client ID is public and safe to expose in frontend code (it's not a secret).

### 3. Development Mode

Run the backend and frontend separately for development:

```bash
# Terminal 1: Start backend server
npm run web:dev

# Terminal 2: Start frontend dev server (shared across all platforms)
npm run frontend:dev
```

The frontend will run on `http://localhost:5173` with proxy to backend on `http://localhost:3000`.

**Desktop Development (Electron)**:
```bash
# Terminal 1: Start frontend dev server
npm run frontend:dev

# Terminal 2: Start Electron app
npm run desktop:dev
```

The Electron app will connect to the frontend dev server automatically.

### 4. Production Build

Build and run for different platforms:

**Web Application**:
```bash
# Build everything (frontend + backend)
npm run web:build

# Start production server
npm run web:start
```
The web application will be available at `http://localhost:3000`.

**Desktop Application (Electron)**:
```bash
# Build desktop app with installers
npm run desktop:build
```
This creates platform-specific installers in the `build/` directory.

**Mobile Application (Capacitor)**:
```bash
# Build and sync for Android
npm run mobile:build
npm run mobile:run:android

# Build and sync for iOS
npm run mobile:build
npm run mobile:run:ios
```

## API Endpoints

### Authentication
- `POST /api/auth/google` - Google OAuth login
- `GET /api/auth/me` - Get current user (protected)
- `POST /api/auth/logout` - Logout

### Search Operations
- `POST /api/search/start` - Start new search
- `POST /api/search/:id/pause` - Pause active search
- `POST /api/search/:id/resume` - Resume paused search
- `POST /api/search/:id/stop` - Stop search

### Session Management
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/generate` - Generate all outputs
- `POST /api/sessions/:id/prisma-paper` - Generate PRISMA paper
- `GET /api/sessions/:id/download/:type` - Download file (csv/bibtex/latex/zip)

### System
- `GET /health` - Health check

## WebSocket Events

### Client Subscribes
```javascript
socket.emit('subscribe', sessionId);
```

### Server Emits
- `progress:${sessionId}` - Progress updates
- `paper:${sessionId}` - New paper found
- `error:${sessionId}` - Error notifications
- `outputs:${sessionId}` - Outputs generated

## Usage Workflow

### 1. Authentication
- User visits the application
- Clicks "Sign in with Google"
- Authenticates and receives JWT token

### 2. Create Search
- Enter search name (optional)
- Add inclusion keywords (at least one required)
- Add exclusion keywords (optional)
- Set date range (optional)
- Set result limit (optional)
- Click "Start Literature Review"

### 3. Monitor Progress
- View real-time progress bar and statistics
- Watch browser screenshots update live
- See papers appear in the list as they're found
- Track time elapsed and estimated completion

### 4. Control Search
- **Pause**: Temporarily stop the search
- **Resume**: Continue from where it paused
- **Stop**: Terminate the search permanently

### 5. Download Results
- Click "Generate All Outputs" to create files
- Download individual files (CSV, BibTeX, LaTeX)
- Download complete ZIP archive
- Generate AI-powered PRISMA paper

### 6. Start New Search
- After completion, click "Start New Search"
- Begin a new literature review

## Unified File Structure

The application now uses a **shared frontend** across all platforms (web, desktop, mobile):

```
litrevtools/
├── src/
│   ├── core/                         # Shared business logic (isomorphic)
│   │   ├── database/                 # SQLite database
│   │   ├── scholar/                  # Google Scholar scraper
│   │   ├── gemini/                   # AI integration
│   │   ├── outputs/                  # Output generators
│   │   └── types/                    # TypeScript types
│   │
│   ├── frontend/                     # SHARED React UI (all platforms)
│   │   ├── src/
│   │   │   ├── components/          # React components
│   │   │   │   ├── SearchForm.tsx
│   │   │   │   ├── ProgressDashboard.tsx
│   │   │   │   ├── ScreenshotViewer.tsx
│   │   │   │   ├── PaperList.tsx
│   │   │   │   ├── OutputDownloads.tsx
│   │   │   │   └── GoogleAuth.tsx
│   │   │   ├── pages/               # Page components
│   │   │   │   └── SearchPage.tsx
│   │   │   ├── hooks/               # Custom React hooks
│   │   │   │   ├── useSocket.ts
│   │   │   │   └── useProgress.ts
│   │   │   ├── utils/               # Utilities
│   │   │   │   ├── api.ts
│   │   │   │   └── helpers.ts
│   │   │   ├── types/               # TypeScript types
│   │   │   ├── styles/              # CSS styles
│   │   │   ├── App.tsx              # Main app component
│   │   │   └── main.tsx             # Entry point
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── tsconfig.json
│   │
│   └── platforms/                    # Platform-specific wrappers
│       ├── web/                      # Web server (Express + Socket.IO)
│       │   ├── server.ts            # Serves shared frontend
│       │   ├── auth.ts              # Authentication middleware
│       │   └── public/              # Static fallback files
│       │
│       ├── desktop/                  # Electron wrapper
│       │   ├── main.ts              # Loads shared frontend
│       │   └── preload.ts           # IPC bridge
│       │
│       ├── mobile/                   # Capacitor wrapper
│       │   └── index.ts             # Mobile API bridge
│       │
│       └── cli/                      # Command-line interface
│           └── index.ts
│
├── capacitor.config.json             # Points to shared frontend
└── package.json                      # Unified build scripts
```

### Single Source, Multiple Platforms

The **same React application** (`src/frontend/`) is used by:
- **Web**: Served by Express at `http://localhost:3000`
- **Desktop**: Loaded by Electron in a native window
- **Mobile**: Bundled by Capacitor for iOS/Android

## Security Considerations

### Production Deployment

1. **Change JWT Secret**: Update `JWT_SECRET` in `.env` to a strong, random string
2. **HTTPS Only**: Deploy behind HTTPS (Nginx/Apache)
3. **CORS Configuration**: Update CORS settings in `server.ts` to restrict origins
4. **Environment Variables**: Never commit `.env` to version control
5. **Google OAuth**: Configure authorized redirect URIs in Google Cloud Console

### Example Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Deployment with PM2

```bash
# Setup deployment
npm run deploy:setup

# Start application
npm run deploy:start

# Restart after changes
npm run deploy:restart

# View logs
npm run deploy:logs

# Check status
npm run deploy:status

# Stop application
npm run deploy:stop
```

## Troubleshooting

### Frontend not loading
- Ensure frontend is built: `npm run web:frontend:build`
- Check if dist folder exists: `ls src/platforms/web/frontend/dist`

### Authentication errors
- Verify Google OAuth credentials in `.env`
- Check browser console for CORS errors
- Ensure redirect URIs are configured in Google Cloud Console

### Socket.IO connection issues
- Verify backend is running on port 3000
- Check firewall rules
- Ensure CORS is properly configured

### Puppeteer errors
- Chrome binary may be missing: `npx puppeteer browsers install chrome`
- Check system dependencies for headless Chrome

## Browser Compatibility

- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Supported (with minor limitations)
- Mobile browsers: ✅ Responsive design

## Performance Notes

- **Concurrent Searches**: System supports multiple concurrent searches
- **WebSocket Scaling**: Use Redis adapter for horizontal scaling
- **Database**: SQLite suitable for single-server deployment
- **Memory Usage**: ~500MB per active search (due to Puppeteer)

## Contributing

This interface is part of the LitRevTools project. See main README for contribution guidelines.

## License

MIT License - See main LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/yourusername/litrevtools/issues)
- Documentation: See main README.md

---

**Built with ❤️ using React, TypeScript, Express, and Google AI**
