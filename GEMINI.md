# GEMINI.md

## Project Overview

LitRevTools is an isomorphic application designed to streamline systematic literature reviews using the PRISMA methodology. It automates the extraction of research papers from the Semantic Scholar API, leverages Google Gemini for intelligent filtering and analysis, and generates publication-ready research papers. The project supports multiple platforms including Command Line Interface (CLI), Web, Desktop, and Mobile, all from a single codebase.

Key features include:
- **Isomorphic Architecture**: Single codebase for multiple platforms.
- **Semantic Scholar Integration**: Automated paper extraction with rate limiting and pagination.
- **AI-Powered Filtering**: Utilizes Google Gemini for intelligent paper filtering and analysis.
- **Real-time Progress**: Live updates via WebSocket.
- **Portable Database**: Uses SQLite for data storage.
- **Multiple Output Formats**: Supports CSV, BibTeX, LaTeX, PRISMA diagrams, and ZIP archives.
- **Batch Processing**: Efficient parallel processing.
- **Smart Filtering**: LLM-based semantic filtering or rule-based keyword matching.
- **API Key Management**: Supports rotation of API keys.

## Building and Running

### Prerequisites

- Node.js 18+
- npm

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/litrevtools.git
    cd litrevtools
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Copy and configure environment variables:
    ```bash
    cp .env.example .env
    # Edit .env with your API keys (GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SEMANTIC_SCHOLAR_API_KEY)
    ```

### Building the Project

```bash
# Build all project components
npm run build
```

### Running the Application

#### Command-Line Interface (CLI)

```bash
# Start an interactive search
npm run cli search

# Start a search with parameters
npm run cli search --name "LLM Math Reasoning Review" --include "large language model" "mathematical reasoning" --exclude "survey" "review" --max 100

# List all search sessions
npm run cli list

# View details of a specific session
npm run cli view <session-id>

# Generate outputs for a session
npm run cli generate <session-id>
```

#### Web Application (Development)

```bash
# Start the web server in development mode
npm run web:dev
# Access at http://localhost:3001 (or configured port)
```

#### Desktop Application

```bash
# Run in development mode
npm run desktop:dev

# Build for production
npm run desktop:build
```

#### Mobile Application

```bash
# Initialize Capacitor
npm run mobile:init

# Add platforms (e.g., Android)
npm run mobile:add:android

# Sync web assets to native projects
npm run mobile:sync
```

### Production Deployment

For production, the project utilizes PM2 for process management and nginx as a reverse proxy. Refer to `DEPLOYMENT.md` for detailed instructions.

```bash
# Basic deployment setup commands
npm run deploy:setup    # Builds and starts the service with PM2
npm run deploy:restart  # Restarts the service
npm run deploy:logs     # Views logs
npm run deploy:status   # Checks service status
```

## Development Conventions

-   **Language**: TypeScript is used throughout the project.
-   **Architecture**: Employs an isomorphic approach, separating core business logic (`src/core`) from platform-specific implementations (`src/platforms`).
-   **Database**: Utilizes SQLite for persistent data storage, with the database schema managed in the `src/core/database` module.
-   **Web Framework**: Express.js and Socket.IO are used for the web application backend.
-   **Desktop Framework**: Electron is used for building the desktop application.
-   **Mobile Framework**: Capacitor is used for mobile application development.
-   **Testing**: Unit tests can be run using the command `npm test`.
-   **Environment Variables**: Configuration is managed via `.env` files, with `.env.example` provided as a template.
-   **API Integration**: Includes dedicated modules for interacting with external APIs like Semantic Scholar and Google Gemini.
-   **Code Structure**: The `src` directory is organized into `core`, `frontend`, and `platforms` subdirectories.

## Key Files and Directories

-   `package.json`: Project dependencies, scripts, and metadata.
-   `tsconfig.json`: TypeScript compiler options.
-   `README.md`: Project overview, features, setup, and usage instructions.
-   `.env.example`: Example environment variables for configuration.
-   `src/core/`: Contains the core, platform-independent business logic.
    -   `scholar/`: Handles Semantic Scholar API interactions.
    -   `llm/`: Implements LLM functionalities (e.g., filtering, analysis).
    -   `database/`: Manages SQLite database operations.
    -   `gemini/`: Integrates with the Google Gemini API for content generation.
    -   `outputs/`: Contains logic for generating various output formats.
    -   `types/`: Defines TypeScript interfaces and types used across the project.
-   `src/platforms/`: Contains platform-specific implementations (CLI, web, desktop, mobile).
-   `scripts/`: Contains utility scripts for deployment and setup.
-   `data/`: Stores data such as outputs and the SQLite database.
-   `docs/`: Contains project documentation.
-   `ecosystem.config.js`: PM2 configuration for process management.
-   `nginx.conf.template`: Nginx configuration template for reverse proxying.
-   `run-model-test.sh`: Script for running model tests.
-   `test-*.js` files: Various test scripts for different functionalities.
