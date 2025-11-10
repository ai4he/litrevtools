#!/bin/bash

# LitRevTools Deployment Setup Script
# This script handles all system dependencies and initial setup

set -e

echo "🚀 LitRevTools Deployment Setup"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run as root or with sudo${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Installing system dependencies...${NC}"

# Update package list
apt-get update -qq

# Install build-essential for native module compilation (better-sqlite3, sharp, etc.)
if ! dpkg -l | grep -q build-essential; then
    echo "Installing build-essential..."
    apt-get install -y build-essential
else
    echo "✓ build-essential already installed"
fi

# Install other useful dependencies
apt-get install -y curl wget git nginx certbot python3-certbot-nginx

echo -e "${GREEN}✓ System dependencies installed${NC}"

# Check Node.js version
echo -e "${YELLOW}📋 Checking Node.js version...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js version: $NODE_VERSION"

    # Check if it's a compatible version (v18+)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo -e "${RED}❌ Node.js version must be 18 or higher${NC}"
        echo "Please upgrade Node.js before continuing"
        exit 1
    fi
else
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18+ before continuing"
    exit 1
fi

# Check if PM2 is installed globally
echo -e "${YELLOW}📋 Checking PM2...${NC}"
if command -v pm2 &> /dev/null; then
    echo "✓ PM2 is installed"
else
    echo "Installing PM2 globally..."
    npm install -g pm2
    echo "✓ PM2 installed"
fi

echo ""
echo -e "${GREEN}✅ System setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Run: cd /path/to/litrevtools"
echo "2. Run: npm install"
echo "3. Run: npm run deploy:setup"
echo "4. Configure your .env file"
echo "5. Run: npm run deploy:start"
