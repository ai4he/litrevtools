# Public Web Files

## Overview

The `src/platforms/web/public/` directory contains static files that are served by the web server at the root URL.

## Required Files

- **index.html** - The main landing page (REQUIRED)
  - Displays system status
  - Shows API endpoints
  - Provides links to health check and sessions

## Deployment

Static files are automatically copied from `src/platforms/web/public/` to `dist/platforms/web/public/` during:

1. Build process: `npm run web:copy-static`
2. Deployment: `npm run deploy:setup`

## File Structure

```
src/platforms/web/public/
└── index.html          # Main landing page
```

After build/deployment:

```
dist/platforms/web/public/
└── index.html          # Copied from src
```

## Adding New Static Files

To add new static files (CSS, JS, images, etc.):

1. Add files to `src/platforms/web/public/`
2. Run `npm run web:copy-static` or `npm run deploy:setup`
3. Files will be automatically copied to dist and served

## Troubleshooting

### "ENOENT: no such file or directory" error

This means the index.html file is missing. To fix:

```bash
# Ensure the file exists in source
ls -la src/platforms/web/public/index.html

# Copy static files
npm run web:copy-static

# Restart the server
pm2 restart litrevtools-web
```

### Files not updating

If changes to static files aren't reflected:

```bash
# Rebuild and copy
npm run web:copy-static

# Restart server
pm2 restart litrevtools-web

# Clear browser cache or use hard refresh (Ctrl+Shift+R)
```

## Default index.html

The default index.html provides:
- Clean, modern UI
- System status display
- API endpoint documentation
- Links to health check and API
- Responsive design
- Dynamic version display from /health endpoint
