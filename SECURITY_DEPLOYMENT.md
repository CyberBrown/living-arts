# Security & Deployment Guide

This guide covers the security improvements and deployment steps for the Living Arts video production platform.

## Security Improvements

### P0: Completed Security Features

1. **API Secrets Management** - All API keys now use Cloudflare Secrets instead of hardcoded values
2. **API Key Authentication** - All worker endpoints require valid API keys stored in D1 database
3. **Database Migration** - API keys table with proper indexing and tracking

## Prerequisites

Before deploying, ensure you have:

- Cloudflare account with Workers enabled
- Wrangler CLI installed (`npm install -g wrangler`)
- API keys for external services:
  - Anthropic API key (Claude AI)
  - ElevenLabs API key (text-to-speech)
  - Pexels API key (stock video)
  - Shotstack API key (video rendering)

## Deployment Steps

### 1. Run Database Migration

First, apply the API keys migration to create the authentication table:

```bash
cd /home/chris/living-arts
npx wrangler d1 execute living-arts-db --file=./migrations/0002_add_api_keys.sql
```

This creates:
- `api_keys` table for storing valid API keys
- Indexes for fast lookups
- A default development API key

### 2. Generate Production API Key

After running the migration, retrieve the generated development API key:

```bash
npx wrangler d1 execute living-arts-db --command="SELECT key FROM api_keys WHERE id = 'dev-key-001'"
```

For production, generate a new secure API key:

```bash
npx wrangler d1 execute living-arts-db --command="INSERT INTO api_keys (id, instance_id, key, name, enabled) VALUES ('prod-key-001', 'living-arts', 'la_prod_$(openssl rand -hex 32)', 'Production API Key', 1)"
```

Then retrieve the generated key:

```bash
npx wrangler d1 execute living-arts-db --command="SELECT key FROM api_keys WHERE name = 'Production API Key'"
```

**Important**: Save this API key securely - you'll need it for all API requests.

### 3. Configure Worker Secrets

Set up the required secrets for each worker:

#### Video Workflow Worker

```bash
cd workers/video-workflow
npx wrangler secret put ANTHROPIC_API_KEY
# Paste your Anthropic API key when prompted
```

#### Audio Generation Worker

```bash
cd workers/audio-gen
npx wrangler secret put ELEVENLABS_API_KEY
# Paste your ElevenLabs API key when prompted
```

#### Stock Media Worker

```bash
cd workers/stock-media
npx wrangler secret put PEXELS_API_KEY
# Paste your Pexels API key when prompted
```

#### Render Service Worker

```bash
cd workers/render-service
npx wrangler secret put SHOTSTACK_API_KEY
# Paste your Shotstack API key when prompted
```

### 4. Deploy Workers

Deploy each worker in order:

```bash
# Deploy stock media worker (no dependencies)
cd workers/stock-media
npx wrangler deploy

# Deploy audio generation worker (no dependencies)
cd ../audio-gen
npx wrangler deploy

# Deploy render service worker (no dependencies)
cd ../render-service
npx wrangler deploy

# Deploy video workflow worker (orchestrates others)
cd ../video-workflow
npx wrangler deploy
```

### 5. Verify Deployment

Test each worker's health endpoint:

```bash
# Get your production API key from step 2
API_KEY="your_generated_api_key_here"

# Test video-workflow
curl -H "x-api-key: $API_KEY" https://video-workflow.YOUR_ACCOUNT.workers.dev/health

# Test audio-gen
curl -H "x-api-key: $API_KEY" https://audio-gen.YOUR_ACCOUNT.workers.dev/health

# Test stock-media
curl -H "x-api-key: $API_KEY" https://stock-media.YOUR_ACCOUNT.workers.dev/health

# Test render-service
curl -H "x-api-key: $API_KEY" https://render-service.YOUR_ACCOUNT.workers.dev/health
```

All should return `{"status": "healthy", ...}` with a 200 status code.

## Using the API

### Authentication

All API requests (except `/health` and `/webhook` endpoints) require the `x-api-key` header:

```bash
curl -X POST https://video-workflow.YOUR_ACCOUNT.workers.dev/start \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "projectId": "project-123",
    "prompt": "Create a video about renewable energy",
    "duration": 30
  }'
```

### Error Responses

If authentication fails, you'll receive:

```json
{
  "success": false,
  "error": "Invalid API key",
  "timestamp": "2025-12-05T..."
}
```

Status codes:
- `401` - Missing or invalid API key
- `403` - Invalid instance or project access
- `429` - Rate limit exceeded (if rate limiting is configured)

## Managing API Keys

### List All API Keys

```bash
npx wrangler d1 execute living-arts-db --command="SELECT id, name, enabled, created_at, last_used_at FROM api_keys"
```

### Disable an API Key

```bash
npx wrangler d1 execute living-arts-db --command="UPDATE api_keys SET enabled = 0 WHERE id = 'key-id-here'"
```

### Create a New API Key

```bash
npx wrangler d1 execute living-arts-db --command="INSERT INTO api_keys (id, instance_id, key, name, enabled) VALUES ('custom-key-001', 'living-arts', 'la_custom_$(openssl rand -hex 32)', 'Custom Key Name', 1)"
```

### Delete an API Key

```bash
npx wrangler d1 execute living-arts-db --command="DELETE FROM api_keys WHERE id = 'key-id-here'"
```

## Security Best Practices

1. **Rotate API Keys Regularly** - Generate new keys and disable old ones periodically
2. **Use Different Keys Per Environment** - Separate keys for dev, staging, and production
3. **Monitor last_used_at** - Track when keys were last used to identify unused keys
4. **Enable Rate Limiting** - Configure Durable Objects rate limiting for production (optional)
5. **Audit Key Usage** - Regularly review which keys are active and who has access

## Troubleshooting

### "Missing API key" Error

Ensure you're sending the `x-api-key` header with every request:

```bash
curl -H "x-api-key: YOUR_KEY" ...
```

### "Invalid API key" Error

Check that:
1. The key exists in the database
2. The key is enabled (`enabled = 1`)
3. You're using the correct key value

```bash
npx wrangler d1 execute living-arts-db --command="SELECT * FROM api_keys WHERE key = 'YOUR_KEY'"
```

### Worker Deployment Fails

If a worker fails to deploy:

1. Verify secrets are set: `npx wrangler secret list`
2. Check wrangler.toml bindings are correct
3. Ensure D1 database exists and migration ran successfully

### Authentication Still Failing

1. Verify the migration ran successfully:
   ```bash
   npx wrangler d1 execute living-arts-db --command="SELECT COUNT(*) as count FROM api_keys"
   ```

2. Check worker logs:
   ```bash
   npx wrangler tail video-workflow
   ```

## Configuring the Pages Frontend

The Qwik frontend (deployed to Cloudflare Pages) needs to be configured with an API key to authenticate with the workers.

### Set Pages Environment Variable

1. Go to your Cloudflare Dashboard
2. Navigate to **Pages** → Your project (living-arts)
3. Go to **Settings** → **Environment variables**
4. Add a new production variable:
   - **Name**: `WORKER_API_KEY`
   - **Value**: The production API key you generated earlier

5. Redeploy your Pages app for the changes to take effect

### Alternative: Development Mode

For local development, create a `.dev.vars` file in the project root:

```bash
WORKER_API_KEY=your_development_api_key_here
VIDEO_WORKFLOW_URL=http://localhost:8787  # If testing locally
```

**Important**: Add `.dev.vars` to your `.gitignore` to avoid committing secrets.

## Next Steps

After completing security deployment:

1. **Configure Pages environment variable** with WORKER_API_KEY
2. **Test the full video production workflow** with your production API key
3. **Set up monitoring** for worker errors and authentication failures
4. **Configure rate limiting** (see P3 tasks in TODO.md)
5. **Implement additional security features** from the TODO.md backlog

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
