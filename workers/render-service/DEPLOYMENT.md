# Deployment Guide for Render Service

This guide will walk you through deploying the `render-service` Cloudflare Worker.

## Prerequisites

- Cloudflare account with Workers enabled
- Cloudflare API token (create at https://dash.cloudflare.com/profile/api-tokens)
- Shotstack API key: `uZdyBrEG7rXXCxs8diDzxUa5L6HBrjgUqpluBDlt`
- R2 bucket named `living-arts` (already created)
- D1 database (already created)

## Step 1: Authenticate with Cloudflare

```bash
# Set your Cloudflare API token
export CLOUDFLARE_API_TOKEN="your-api-token-here"

# Or use wrangler login (interactive)
npx wrangler login
```

## Step 2: Create KV Namespace for Render Jobs

The worker needs a KV namespace to track render jobs:

```bash
cd workers/render-service
npx wrangler kv:namespace create RENDER_JOBS
```

This will output something like:

```
Created namespace with id "abc123def456ghi789"
```

Copy the namespace ID and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RENDER_JOBS"
id = "abc123def456ghi789"  # Replace with your ID
```

## Step 3: Configure Shotstack API Key

Store the Shotstack API key as a secret:

```bash
npx wrangler secret put SHOTSTACK_API_KEY
```

When prompted, paste:

```
uZdyBrEG7rXXCxs8diDzxUa5L6HBrjgUqpluBDlt
```

## Step 4: Verify Configuration

Check that your `wrangler.toml` has all the required bindings:

- ✓ `R2_BUCKET` - For storing rendered videos
- ✓ `DB` - D1 database (optional for additional tracking)
- ✓ `PROVIDER_KEYS` - KV namespace for API keys
- ✓ `RENDER_JOBS` - KV namespace (ID from Step 2)

## Step 5: Deploy to Cloudflare

```bash
npx wrangler deploy
```

You should see output like:

```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded render-service (X.XX sec)
Published render-service (X.XX sec)
  https://render-service.YOUR_SUBDOMAIN.workers.dev
```

Copy your worker URL - you'll need it for testing.

## Step 6: Test the Deployment

### Health Check

```bash
curl https://render-service.YOUR_SUBDOMAIN.workers.dev/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "render-service",
    "timestamp": "2024-12-02T12:00:00Z"
  },
  "request_id": "...",
  "timestamp": "..."
}
```

### Test Render (Minimal)

```bash
curl -X POST https://render-service.YOUR_SUBDOMAIN.workers.dev/render \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test-deployment",
    "project_id": "test-project-001",
    "timeline": {
      "duration": 5,
      "resolution": { "width": 1920, "height": 1080 },
      "fps": 30,
      "tracks": {
        "video": [{
          "id": "track-1",
          "clips": [{
            "id": "clip-1",
            "type": "stock",
            "src": "https://cdn.shotstack.io/au/stage/c9npc4w5c4/d1c7e0e2-8e08-4e36-9a76-4186a67f676f.mp4",
            "start": 0,
            "duration": 5
          }]
        }],
        "audio": [],
        "overlay": []
      }
    },
    "options": {
      "format": "mp4",
      "resolution": "hd"
    }
  }'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "render_id": "shotstack-uuid-here",
    "status": "queued",
    "estimated_time": 30,
    "webhook_configured": false
  },
  "request_id": "...",
  "timestamp": "..."
}
```

### Check Render Status

Use the `render_id` from the previous step:

```bash
curl https://render-service.YOUR_SUBDOMAIN.workers.dev/status/RENDER_ID_HERE
```

## Step 7: Monitor Logs

View real-time logs:

```bash
npx wrangler tail
```

Or view in the Cloudflare dashboard:

1. Go to https://dash.cloudflare.com
2. Navigate to Workers & Pages
3. Click on `render-service`
4. Click on "Logs"

## Troubleshooting

### Error: "Missing SHOTSTACK_API_KEY"

The secret wasn't set correctly. Run:

```bash
npx wrangler secret put SHOTSTACK_API_KEY
```

### Error: "Cannot read KV namespace"

The RENDER_JOBS namespace ID in `wrangler.toml` is incorrect or not created. Verify:

1. The namespace exists: `npx wrangler kv:namespace list`
2. The ID in `wrangler.toml` matches

### Error: "Failed to submit render job"

Check the Shotstack API:

- Are you using the correct environment? (`stage` for sandbox)
- Is the API key valid?
- Do you have available renders? (Sandbox: 20/month)

### Webhook Not Working

Ensure your webhook URL:

- Is publicly accessible
- Accepts POST requests
- Returns a 2xx status code
- Is HTTPS (required by Shotstack)

## Production Deployment

### Switch to Production Shotstack

1. Get a production Shotstack API key
2. Update `wrangler.toml`:

```toml
[vars]
SHOTSTACK_ENV = "v1"  # Changed from "stage"
```

3. Update the API key secret:

```bash
npx wrangler secret put SHOTSTACK_API_KEY
# Enter your production API key
```

4. Redeploy:

```bash
npx wrangler deploy
```

### Enable Rate Limiting (Optional)

If you have a rate-limiter Durable Object worker:

1. Uncomment the durable_objects section in `wrangler.toml`
2. Update the script_name if needed
3. Redeploy

### Custom Domain (Optional)

Add a custom domain in the Cloudflare dashboard:

1. Workers & Pages → render-service
2. Settings → Domains & Routes
3. Add custom domain (e.g., `render.yourdomain.com`)

## Next Steps

- Configure webhooks in your main application
- Set up monitoring and alerts
- Add custom authentication if needed
- Implement usage tracking and analytics
- Consider adding caching for status checks

## Support

For issues with:

- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Shotstack API**: https://shotstack.io/docs/
- **This worker**: Check the README.md and logs

## Environment Variables Summary

| Variable | Type | Value | Set Via |
|----------|------|-------|---------|
| SHOTSTACK_API_KEY | Secret | `uZdyBrEG...` | `wrangler secret` |
| SHOTSTACK_ENV | Var | `stage` or `v1` | `wrangler.toml` |
| CONFIG_SERVICE_URL | Var | API URL | `wrangler.toml` |

## Bindings Summary

| Binding | Type | Name/ID | Purpose |
|---------|------|---------|---------|
| R2_BUCKET | R2 | `living-arts` | Store rendered videos |
| DB | D1 | `living-arts-db` | Optional tracking |
| PROVIDER_KEYS | KV | `60eab...` | API keys storage |
| RENDER_JOBS | KV | Created in Step 2 | Job tracking |
| RATE_LIMITER | DO | Optional | Rate limiting |
