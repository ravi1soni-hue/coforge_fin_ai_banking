# Deployment Checklist for Railway

## ✅ Completed
- [x] Created `index.js` entry point
- [x] Fixed DB error handling (removed process.exit)
- [x] Added environment validation
- [x] Added global error handler middleware
- [x] Added graceful shutdown
- [x] Created `.env.example` for documentation
- [x] Created `.gitignore`
- [x] Added npm start script

## 🔧 To Do Before Production

### Security & Environment
- [ ] Set all env variables in Railway dashboard:
  - `NODE_ENV=production`
  - `DATABASE_URL=postgresql://...` (Railway PostgreSQL addon)
  - `OPENAI_API_KEY=sk_...`
  - `PORT` (Railway auto-assigns)

### Code Cleanup
- [ ] Remove commented code in `src/sockets/socket.js` (handleChatMessage)
- [ ] Remove unused `testDb()` import from utils
- [ ] Implement actual chat message handler or remove skeleton

### Dependencies
- [ ] Consider removing `socket.io` from package.json (using `ws` instead)
  ```bash
  npm uninstall socket.io
  npm install compression helmet
  ```

### Deployment Steps
1. **Add nginx/compression** (optional but recommended):
   ```js
   // In app.js, after cors()
   import compression from 'compression';
   import helmet from 'helmet';
   
   app.use(helmet());
   app.use(compression());
   ```

2. **Push to Git**:
   ```bash
   git add .
   git commit -m "fix: deployment configuration and error handling"
   git push origin main
   ```

3. **In Railway Dashboard**:
   - Connect GitHub repo
   - Add PostgreSQL plugin (generates DATABASE_URL)
   - Set environment variables
   - Deploy

### Monitoring
- [ ] Check Railway logs after deployment
- [ ] Test health endpoint: `GET /health`
- [ ] Test API endpoints with real data
- [ ] Monitor WebSocket connections

## 🚨 Potential Issues to Watch
- DB connection timeout on first request (normal, connection pool initializes)
- Missing OPENAI_API_KEY will cause startup failure
- WebSocket will accept connections but chat handler commented out
