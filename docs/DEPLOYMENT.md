# LitRevTools Deployment Guide

This guide covers deploying the LitRevTools web server to a production environment.

## Prerequisites

- Ubuntu 20.04+ or Debian-based Linux
- Node.js 18+ (Node.js 24 recommended)
- npm or yarn
- sudo/root access for system dependencies
- A domain name (optional, for public access)

## Quick Start

### 1. System Setup

Run the system setup script as root to install required dependencies:

```bash
sudo bash scripts/setup.sh
```

This installs:
- build-essential (for compiling native modules like better-sqlite3 and sharp)
- nginx (reverse proxy)
- certbot (SSL certificates)
- PM2 (process manager, if not already installed)

### 2. Application Setup

Install Node.js dependencies:

```bash
npm install
```

### 3. Environment Configuration

Create and configure your environment file:

```bash
cp .env.example .env
nano .env  # or your preferred editor
```

**Important Environment Variables:**

```env
# Gemini API (required for PRISMA paper generation)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest

# Web Server Configuration
WEB_PORT=3001
WEB_HOST=localhost

# Database
DATABASE_PATH=./data/litrevtools.db

# Output Directory
OUTPUT_DIR=./data/outputs
```

### 4. Build and Deploy

Deploy the application using the deployment script:

```bash
npm run deploy:setup
```

This will:
- Install dependencies
- Build TypeScript code
- Create necessary directories
- Start the application with PM2
- Save PM2 configuration

## Port Configuration

The default port is 3001. If this port is already in use:

1. Update `.env`:
   ```env
   WEB_PORT=3002  # or any available port
   ```

2. Redeploy:
   ```bash
   npm run deploy:restart
   ```

## PM2 Process Management

### Useful Commands

```bash
# View process status
npm run deploy:status
# or
pm2 list

# View logs
npm run deploy:logs
# or
pm2 logs litrevtools-web

# Restart application
npm run deploy:restart

# Stop application
npm run deploy:stop

# Start application
npm run deploy:start

# Monitor resources
pm2 monit
```

### Auto-start on System Reboot

The deployment script automatically configures PM2 to start on boot. To verify:

```bash
pm2 startup
pm2 save
```

## Nginx Reverse Proxy Setup

### For Domain Access

1. Copy the nginx template:
   ```bash
   sudo cp nginx.conf.template /etc/nginx/sites-available/your-domain.com
   ```

2. Edit the configuration:
   ```bash
   sudo nano /etc/nginx/sites-available/your-domain.com
   ```

3. Replace placeholders:
   - `YOUR_DOMAIN` → your actual domain (e.g., `litrev.example.com`)
   - `YOUR_PORT` → your configured port (default: `3001`)

4. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/
   ```

5. Test configuration:
   ```bash
   sudo nginx -t
   ```

6. Reload nginx:
   ```bash
   sudo systemctl reload nginx
   ```

### SSL Certificate (Let's Encrypt)

Install SSL certificate using certbot:

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically:
- Obtain and install the SSL certificate
- Configure nginx for HTTPS
- Set up automatic renewal

## Troubleshooting

### Port Already in Use

If you get "EADDRINUSE" error:

```bash
# Find what's using the port
sudo lsof -i :3001

# Kill the process (if safe to do so)
sudo fuser -k 3001/tcp

# Or change the port in .env and redeploy
```

### Build Errors

**Error: "better-sqlite3" compilation fails**

Solution: Install build-essential
```bash
sudo apt-get install build-essential
npm install
```

**Error: TypeScript compilation errors in mobile/desktop**

The tsconfig.json is already configured to exclude these platforms. If you encounter issues:
```bash
# Verify tsconfig.json excludes mobile and desktop
cat tsconfig.json | grep exclude
```

### Module Not Found Errors

If you get "Cannot find module 'dotenv'" or similar:

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
npm run deploy:restart
```

### Database Permissions

If you get database permission errors:

```bash
# Ensure data directory exists and is writable
mkdir -p data/outputs
chmod -R 755 data
```

## Monitoring and Logs

### Application Logs

```bash
# Real-time logs
pm2 logs litrevtools-web

# Last 100 lines
pm2 logs litrevtools-web --lines 100

# Error logs only
pm2 logs litrevtools-web --err

# Output logs only
pm2 logs litrevtools-web --out
```

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/litrevtools.access.log

# Error logs
sudo tail -f /var/log/nginx/litrevtools.error.log
```

### System Resources

```bash
# PM2 monitoring dashboard
pm2 monit

# Process information
pm2 info litrevtools-web
```

## Updating the Application

### Pull Latest Changes

```bash
# Pull from git
git pull origin main

# Redeploy
npm run deploy:setup
```

### Manual Update

```bash
# Install new dependencies
npm install

# Rebuild
npm run build

# Restart
npm run deploy:restart
```

## Security Considerations

1. **Firewall Configuration**
   ```bash
   # Allow only necessary ports
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP
   sudo ufw allow 443   # HTTPS
   sudo ufw enable
   ```

2. **Environment Variables**
   - Never commit `.env` to version control
   - Use strong API keys
   - Restrict file permissions: `chmod 600 .env`

3. **Regular Updates**
   - Keep Node.js updated
   - Update npm packages regularly: `npm audit fix`
   - Update system packages: `sudo apt-get update && sudo apt-get upgrade`

4. **SSL/TLS**
   - Always use HTTPS in production
   - Let's Encrypt certificates auto-renew

## Performance Tuning

### PM2 Cluster Mode (Optional)

For higher traffic, enable cluster mode:

Edit `ecosystem.config.js`:
```javascript
instances: 'max',  // or specific number
exec_mode: 'cluster',
```

Then restart:
```bash
pm2 reload ecosystem.config.js
```

### Database Optimization

For large literature reviews:
- Consider upgrading to PostgreSQL for better performance
- Regular database backups: `cp data/litrevtools.db data/litrevtools.db.backup`

## Backup and Recovery

### Automated Backups

Create a backup script:

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf backup_$DATE.tar.gz data/ .env
# Upload to S3, rsync to remote server, etc.
```

### Recovery

```bash
# Restore from backup
tar -xzf backup_YYYYMMDD_HHMMSS.tar.gz
npm run deploy:restart
```

## Support

For issues and questions:
- Check logs: `pm2 logs litrevtools-web`
- Review this deployment guide
- Check the main README.md
- Open an issue on GitHub

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
