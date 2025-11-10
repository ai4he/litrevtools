# Deployment Configuration Changes

This document summarizes all changes made to improve the deployment process based on the initial deployment experience.

## Issues Encountered During Initial Deployment

1. **Port conflicts** - Multiple attempts to bind to ports 3000, 3001, 3002
2. **Missing dotenv import** - Environment variables weren't being loaded
3. **better-sqlite3 version incompatibility** - Version 9.2.2 didn't support Node.js 24
4. **Missing build-essential** - Native module compilation failed
5. **TypeScript errors** - Mobile and desktop platforms caused build failures
6. **Missing directories** - Public directory and data directories weren't created
7. **Code typo** - "activeSear ches" instead of "activeSearches"
8. **Manual PM2 setup** - No automated deployment process

## Files Created/Modified

### New Files Created

1. **`scripts/setup.sh`**
   - System dependency installation script
   - Installs build-essential, nginx, certbot, PM2
   - Validates Node.js version
   - Run as root/sudo

2. **`scripts/deploy.sh`**
   - Application deployment script
   - Handles building, directory creation, PM2 management
   - Provides deployment status and useful commands

3. **`ecosystem.config.js`**
   - PM2 process configuration
   - Logging configuration
   - Memory limits and restart policies
   - Production environment setup

4. **`nginx.conf.template`**
   - Nginx reverse proxy template
   - WebSocket (Socket.IO) support
   - SSL-ready configuration
   - Proper timeout settings for long-running operations

5. **`DEPLOYMENT.md`**
   - Comprehensive deployment guide
   - Troubleshooting section
   - Security considerations
   - Monitoring and maintenance instructions

6. **`DEPLOYMENT_CHANGES.md`** (this file)
   - Summary of all changes
   - Issue tracking and solutions

7. **`.gitignore`**
   - Prevents committing sensitive files
   - Excludes build artifacts, logs, environment files

### Modified Files

1. **`package.json`**
   - Updated `better-sqlite3` from ^9.2.2 to ^12.4.1 (Node.js 24 compatible)
   - Updated `@types/better-sqlite3` from ^7.6.8 to ^7.6.12
   - Fixed `web:copy-static` script to create directory and handle missing files
   - Added deployment scripts:
     - `deploy:setup` - Build and deploy
     - `deploy:start` - Start with PM2
     - `deploy:restart` - Restart service
     - `deploy:stop` - Stop service
     - `deploy:logs` - View logs
     - `deploy:status` - Check status

2. **`src/platforms/web/server.ts`**
   - Added dotenv import at the top of the file
   - Fixed "activeSear ches" typo to "activeSearches"
   - Ensures environment variables are loaded before server initialization

3. **`tsconfig.json`**
   - Excluded mobile and desktop platforms from compilation
   - Prevents TypeScript errors in unused platforms

4. **`README.md`**
   - Updated Web Application section
   - Changed default port from 3000 to 3001
   - Added Production Deployment section
   - Added quick deployment command reference
   - Links to DEPLOYMENT.md

5. **`.env.example`** (if not already present)
   - Template for environment configuration
   - Documents all required variables

## Key Improvements

### 1. Automated System Setup
```bash
sudo bash scripts/setup.sh
```
- Installs all system dependencies
- Validates environment
- No manual apt-get commands needed

### 2. One-Command Deployment
```bash
npm run deploy:setup
```
- Installs dependencies
- Builds application
- Creates directories
- Starts with PM2
- Saves configuration

### 3. Version Compatibility
- **better-sqlite3**: Updated to v12.4.1 for Node.js 24+ support
- **Build tools**: Automated installation via setup script
- **TypeScript**: Excluded problematic platforms

### 4. Environment Configuration
- **dotenv**: Properly imported in server.ts
- **Default port**: Changed to 3001 to avoid common conflicts
- **Template**: Clear .env.example with documentation

### 5. Process Management
- **PM2 ecosystem**: Configured for production use
- **Auto-restart**: On failure or system reboot
- **Logging**: Structured log files in logs/ directory
- **Memory limits**: Prevents memory leaks

### 6. Reverse Proxy
- **Nginx template**: Ready for production use
- **WebSocket support**: For real-time updates
- **SSL-ready**: Prepared for Let's Encrypt
- **Timeouts**: Configured for long-running operations

### 7. Documentation
- **Deployment guide**: Step-by-step instructions
- **Troubleshooting**: Common issues and solutions
- **Security**: Best practices and considerations
- **Monitoring**: Log viewing and resource monitoring

## Deployment Workflow

### Initial Deployment
```bash
# 1. Clone repository
git clone <repository-url>
cd litrevtools

# 2. System setup (one-time)
sudo bash scripts/setup.sh

# 3. Configure environment
cp .env.example .env
nano .env  # Add API keys

# 4. Deploy
npm run deploy:setup
```

### Updates and Maintenance
```bash
# Pull latest changes
git pull origin main

# Redeploy
npm run deploy:setup

# Or just restart
npm run deploy:restart

# View logs
npm run deploy:logs
```

### Nginx Configuration
```bash
# Copy template
sudo cp nginx.conf.template /etc/nginx/sites-available/your-domain.com

# Edit configuration
sudo nano /etc/nginx/sites-available/your-domain.com

# Enable site
sudo ln -s /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx

# Setup SSL
sudo certbot --nginx -d your-domain.com
```

## Testing Checklist

- [ ] System dependencies installed (`sudo bash scripts/setup.sh`)
- [ ] Node.js version 18+ installed
- [ ] PM2 installed globally
- [ ] Environment file configured (`.env`)
- [ ] Application builds successfully (`npm run build`)
- [ ] PM2 process starts (`npm run deploy:start`)
- [ ] Health endpoint responds (`curl http://localhost:3001/health`)
- [ ] API endpoints work (`curl http://localhost:3001/api/sessions`)
- [ ] Nginx configuration valid (`sudo nginx -t`)
- [ ] Domain accessible (if configured)
- [ ] SSL certificate installed (if configured)
- [ ] PM2 survives system reboot
- [ ] Logs are being written

## Security Improvements

1. **.env not committed** - Added to .gitignore
2. **Nginx security headers** - Configured in template
3. **SSL/TLS ready** - Template prepared for certbot
4. **File permissions** - Scripts made executable only when needed
5. **Log rotation** - PM2 handles log management

## Performance Optimizations

1. **PM2 process management** - Auto-restart on failure
2. **Memory limits** - Prevents memory leaks (1GB limit)
3. **Nginx buffering** - Configured timeouts for long operations
4. **WebSocket support** - Real-time updates without polling
5. **Static file caching** - Ready for future static assets

## Rollback Procedure

If deployment fails:

```bash
# Stop current process
pm2 stop litrevtools-web

# Restore from git
git checkout <previous-commit>

# Rebuild and restart
npm install
npm run build
pm2 restart litrevtools-web
```

Or use nginx backup:

```bash
# Restore nginx config
sudo cp /etc/nginx/sites-available/litrev.haielab.org.backup-* /etc/nginx/sites-available/litrev.haielab.org
sudo nginx -t
sudo systemctl reload nginx
```

## Future Improvements

Potential enhancements for consideration:

1. **Docker support** - Containerized deployment
2. **CI/CD pipeline** - Automated testing and deployment
3. **Database migrations** - Automated schema updates
4. **Health check endpoints** - More comprehensive monitoring
5. **Rate limiting** - Prevent API abuse
6. **Clustering** - Multi-process support via PM2
7. **Monitoring integration** - Grafana, Prometheus, etc.
8. **Backup automation** - Scheduled database backups

## Conclusion

These changes transform the deployment from a manual, error-prone process to a streamlined, automated workflow. The deployment scripts handle all the issues encountered during initial deployment and provide clear documentation for future deployments.
