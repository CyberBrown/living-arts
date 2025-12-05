# Living Arts Pages - Deployment Guide

## Prerequisites
- Cloudflare account with Pages access
- Wrangler CLI authenticated

## Quick Deploy

### Option 1: Using the deployment script
```bash
# Authenticate first
npx wrangler login

# Run the deployment script
./deploy.sh
```

### Option 2: Manual deployment
```bash
# 1. Authenticate
npx wrangler login

# 2. Apply database migration
npx wrangler d1 execute living-arts-db --remote --file=migrations/0001_add_workflow_id.sql

# 3. Deploy to Pages
npx wrangler pages deploy dist --project-name living-arts
```

## Post-Deployment Configuration

After deployment, configure the bindings in the Cloudflare Pages dashboard:

1. Go to: https://dash.cloudflare.com
2. Navigate to: Workers & Pages → living-arts → Settings → Functions
3. Add the following bindings:

### D1 Database Binding
- **Variable name:** `DB`
- **D1 database:** `living-arts-db`

### R2 Bucket Binding
- **Variable name:** `STORAGE`
- **Bucket:** `living-arts`

### Environment Variables
Go to Settings → Environment Variables and add:
- **Name:** `VIDEO_WORKFLOW_URL`
- **Value:** `https://video-workflow.solamp.workers.dev`

## Testing the Deployment

1. Visit your Pages URL (shown after deployment)
2. Create a test project with a prompt like: "Create a 3-minute video about renewable energy"
3. Select duration: 3 minutes
4. Click "Generate Video"
5. Monitor the status - it should show "processing" and poll the workflow Worker
6. Check the workflow Worker logs to verify it received the request

## Architecture

```
User → Living Arts UI (Cloudflare Pages)
          ↓ POST /start
    video-workflow Worker (video-workflow.solamp.workers.dev)
          ↓ Orchestrates
    DE Workers:
      - audio-gen.solamp.workers.dev
      - stock-media.solamp.workers.dev
      - render-service.solamp.workers.dev
```

## Troubleshooting

### Authentication Issues
If you get "Unable to authenticate" errors:
1. Run `npx wrangler logout`
2. Run `npx wrangler login`
3. Try deployment again

### Missing Bindings
If you get runtime errors about missing DB or STORAGE:
- Verify bindings are configured in Pages settings
- Redeploy after adding bindings

### Workflow Not Starting
If projects stay in "starting" status:
- Check VIDEO_WORKFLOW_URL is set correctly
- Verify video-workflow Worker is deployed and accessible
- Check video-workflow Worker logs for errors

## Files Changed

- `src/routes/index.tsx` - Updated to use HTTP fetch instead of Workflows API
- `src/entry.cloudflare-pages.tsx` - Fixed linting issues
- `wrangler.jsonc` - Configured for Pages deployment
- `schema.sql` - Added workflow_id column
- `migrations/0001_add_workflow_id.sql` - Migration for existing databases

## Security Notes

- API tokens provide full account access - never commit them to version control
- Rotate any tokens that were accidentally exposed
- Use environment variables for sensitive configuration
