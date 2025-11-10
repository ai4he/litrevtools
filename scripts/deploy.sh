#!/bin/bash

# LitRevTools Deployment Script
# Handles building and deploying the application with PM2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}🚀 LitRevTools Deployment${NC}"
echo "================================"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env file${NC}"
        echo -e "${YELLOW}⚠️  Please configure your .env file before continuing${NC}"
        exit 0
    else
        echo -e "${RED}❌ .env.example not found${NC}"
        exit 1
    fi
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build TypeScript
echo -e "${YELLOW}🔨 Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"

# Create necessary directories
echo -e "${YELLOW}📁 Creating data directories...${NC}"
mkdir -p data/outputs
mkdir -p dist/platforms/web/public
echo -e "${GREEN}✓ Directories created${NC}"

# Copy static files (required for web interface)
if [ -d "src/platforms/web/public" ] && [ "$(ls -A src/platforms/web/public 2>/dev/null)" ]; then
    echo -e "${YELLOW}📋 Copying static files...${NC}"
    cp -r src/platforms/web/public/* dist/platforms/web/public/ 2>/dev/null || true
    echo -e "${GREEN}✓ Static files copied${NC}"
else
    echo -e "${YELLOW}⚠️  No static files found in src/platforms/web/public/${NC}"
    echo -e "${YELLOW}   Creating a default index.html...${NC}"
    # The web server will serve the default index.html that should be in the public directory
fi

# Check if PM2 is running the app
if pm2 list | grep -q "litrevtools-web"; then
    echo -e "${YELLOW}🔄 Restarting PM2 process...${NC}"
    pm2 restart litrevtools-web --update-env
    echo -e "${GREEN}✓ PM2 process restarted${NC}"
else
    echo -e "${YELLOW}▶️  Starting PM2 process...${NC}"
    pm2 start ecosystem.config.js
    echo -e "${GREEN}✓ PM2 process started${NC}"
fi

# Save PM2 configuration
pm2 save

# Show status
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Application status:"
pm2 list | grep litrevtools-web
echo ""
echo -e "${BLUE}📝 Useful commands:${NC}"
echo "  pm2 logs litrevtools-web  - View logs"
echo "  pm2 monit                 - Monitor resources"
echo "  pm2 restart litrevtools-web - Restart app"
echo "  pm2 stop litrevtools-web  - Stop app"
