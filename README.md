# LitRevTools 🔍

> **Isomorphic Systematic Literature Review Tool using PRISMA Methodology**

LitRevTools is a comprehensive, cross-platform application for conducting systematic literature reviews following the PRISMA (Preferred Reporting Items for Systematic Reviews and Meta-Analyses) methodology. It automatically extracts research papers from Google Scholar and generates publication-ready research papers.

## ✨ Features

- **🔄 Isomorphic Architecture**: Single codebase runs on CLI, Web, Desktop, and Mobile
- **📚 Google Scholar Integration**: Automated paper extraction with parallel year-based searching
- **🔐 Tor Circuit Rotation**: Built-in IP rotation to prevent blocking
- **🤖 AI-Powered**: Uses Google Gemini to generate PRISMA research papers
- **📊 Real-time Progress**: Live updates with screenshots, progress bars, and statistics
- **💾 Portable Database**: SQLite-based storage for easy backup and portability
- **📦 Multiple Output Formats**: CSV, BibTeX, LaTeX, PRISMA diagrams, and ZIP archives
- **⚡ Parallel Processing**: Multiple Tor circuits for faster searches
- **🎯 Smart Filtering**: Automatic inclusion/exclusion based on keywords

## 🏗️ Architecture

```
litrevtools/
├── src/
│   ├── core/                    # Isomorphic business logic
│   │   ├── scholar/             # Google Scholar extraction
│   │   ├── database/            # SQLite database layer
│   │   ├── gemini/              # AI integration
│   │   ├── outputs/             # Output generators
│   │   └── types/               # TypeScript types
│   └── platforms/
│       ├── cli/                 # Command-line interface
│       ├── web/                 # Web application (Express + Socket.IO)
│       ├── desktop/             # Electron desktop app
│       └── mobile/              # Capacitor mobile app
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Tor (optional, for IP rotation)
- Gemini API key
- Google OAuth credentials (for future features)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/litrevtools.git
cd litrevtools

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
# GEMINI_API_KEY=your_api_key_here
# GOOGLE_CLIENT_ID=your_client_id
# GOOGLE_CLIENT_SECRET=your_client_secret

# Build the project
npm run build
```

### Usage

#### CLI

```bash
# Start a search interactively
npm run cli search

# Start a search with parameters
npm run cli search \
  --name "LLM Math Reasoning Review" \
  --include "large language model" "mathematical reasoning" \
  --exclude "survey" "review" \
  --max 100

# List all sessions
npm run cli list

# View session details
npm run cli view <session-id>

# Generate outputs for a session
npm run cli generate <session-id>
```

#### Web Application (Development)

```bash
# Start the web server in development mode
npm run web:dev

# Open in browser
# http://localhost:3001
```

Features:
- Real-time progress updates via WebSocket
- Interactive keyword selection
- Live paper list updates
- Screenshot preview
- One-click output downloads

#### Production Deployment

For production deployment with PM2 and nginx:

```bash
# 1. System setup (run as root/sudo)
sudo bash scripts/setup.sh

# 2. Configure environment
cp .env.example .env
nano .env  # Add your API keys

# 3. Deploy
npm run deploy:setup
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions including:
- Nginx reverse proxy configuration
- SSL/TLS setup with Let's Encrypt
- PM2 process management
- Monitoring and troubleshooting

**Quick deployment commands:**
```bash
npm run deploy:setup    # Build and start with PM2
npm run deploy:restart  # Restart the service
npm run deploy:logs     # View logs
npm run deploy:status   # Check status
```

#### Desktop Application

```bash
# Run in development mode
npm run desktop:dev

# Build for production
npm run desktop:build
```

The desktop app provides:
- Native OS integration
- Offline capability
- System file management
- Better performance

#### Mobile Application

```bash
# Initialize Capacitor
npm run mobile:init

# Add Android platform
npm run mobile:add:android

# Add iOS platform
npm run mobile:add:ios

# Sync web assets
npm run mobile:sync
```

## 📖 How It Works

### 1. Search Configuration

Define your search parameters:
- **Inclusion keywords**: Papers must contain these terms
- **Exclusion keywords**: Papers with these terms are filtered out
- **Max results**: Limit the number of papers (or leave unlimited)
- **Year range**: Focus on specific publication years

### 2. Extraction Process

The tool performs:
1. **Parallel searches** across different years using multiple Tor circuits
2. **Real-time extraction** of paper metadata (title, authors, year, abstract, citations)
3. **Screenshot capture** for monitoring progress
4. **Automatic filtering** based on exclusion criteria

### 3. PRISMA Analysis

Following PRISMA methodology:
- **Identification**: Records found from Google Scholar
- **Screening**: Application of inclusion/exclusion criteria
- **Included**: Final set of papers for review

### 4. Output Generation

Generates:
- **CSV**: Spreadsheet with all paper data
- **BibTeX**: Reference file for LaTeX documents with full citation information
- **LaTeX**: Complete research paper with sections:
  - Abstract
  - Introduction
  - Methodology
  - Results (organized by themes/subsections)
  - Discussion
  - Conclusion
  - **✨ NEW: Iterative Paper Generation**
    - Papers are processed in configurable batches (default: 15 papers)
    - Each batch triggers a complete regeneration of the paper
    - Full paper abstracts and BibTeX info sent to AI for context
    - Papers are intelligently organized into thematic subsections
    - Proper citations using `\cite{}` commands throughout
    - Results section dynamically reorganized as more papers are added
- **PRISMA Diagram**: TikZ flow diagram
- **PRISMA Tables**: Statistical summaries
- **ZIP**: Archive with all outputs

## 🔧 Configuration

### Environment Variables

```env
# Gemini API
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-flash-lite-latest

# Paper Generation Settings
PAPER_BATCH_SIZE=15  # Papers per batch for iterative generation

# Google OAuth (for future features)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Tor Configuration
TOR_SOCKS_PORT=9050
TOR_CONTROL_PORT=9051
TOR_PASSWORD=

# Database
DATABASE_PATH=./data/litrevtools.db

# Web Server
WEB_PORT=3000
WEB_HOST=localhost

# Application Settings
MAX_PARALLEL_REQUESTS=3
SCREENSHOT_ENABLED=true
OUTPUT_DIR=./data/outputs
```

### Tor Setup

For IP rotation to work, install and run Tor:

```bash
# Ubuntu/Debian
sudo apt-get install tor
sudo service tor start

# macOS
brew install tor
brew services start tor

# Windows
# Download Tor Browser Bundle or install Tor as a service
```

## 📊 Database Schema

The SQLite database includes:
- **sessions**: Search configurations and progress
- **papers**: Extracted paper data
- **prisma_data**: PRISMA flow statistics
- **output_files**: Generated output file paths
- **screenshots**: Browser screenshots during extraction

## 🛠️ Development

### Project Structure

- **Core Module** (`src/core`): Platform-independent business logic
- **Platform Modules** (`src/platforms`): Platform-specific implementations
- **Shared Types** (`src/core/types`): TypeScript interfaces and types

### Building

```bash
# Build all
npm run build

# Build and run CLI
npm run dev

# Build and run web
npm run web:dev
```

### Testing

```bash
npm test
```

## 📝 Example Workflow

1. **Start a search**:
   ```bash
   npm run cli search
   ```

2. **Enter parameters**:
   - Include: "large language model", "mathematical reasoning"
   - Exclude: "survey", "review"
   - Max: 50

3. **Monitor progress**:
   - Watch real-time updates
   - See papers as they're found
   - View browser screenshots

4. **Review results**:
   ```bash
   npm run cli view <session-id>
   ```

5. **Download outputs**:
   - Find files in `./data/outputs/<session-id>/`
   - Use the ZIP file for easy sharing

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- PRISMA methodology developers
- Google Scholar
- Tor Project
- Google Generative AI (Gemini)
- All open-source contributors

## ⚠️ Disclaimer

This tool is for academic and research purposes. Please respect:
- Google Scholar's terms of service
- Rate limiting and fair use policies
- Copyright and intellectual property rights
- Academic integrity guidelines

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation
- Review existing issues

---

**Built with ❤️ for researchers, by researchers**