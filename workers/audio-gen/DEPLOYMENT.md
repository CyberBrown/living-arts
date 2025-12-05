# Audio-Gen Worker Deployment Guide

This guide walks you through deploying the audio-gen worker to Cloudflare Workers.

## Prerequisites

1. Cloudflare account with Workers enabled
2. ElevenLabs API key: `sk_9e0d31dc45efc02ede8b1f2bb2629e4c3f67b7bc258f3e01`
3. Node.js 18+ installed
4. Wrangler CLI installed globally or via npm

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
cd workers/audio-gen
npm install
```

### 2. Configure API Key

Set the ElevenLabs API key as a Cloudflare secret:

```bash
npx wrangler secret put ELEVENLABS_API_KEY
```

When prompted, enter:
```
sk_9e0d31dc45efc02ede8b1f2bb2629e4c3f67b7bc258f3e01
```

### 3. Verify Configuration

Check your `wrangler.toml` to ensure:
- R2 bucket binding is correct: `bucket_name = "living-arts"`
- D1 database ID matches your database (if using)
- KV namespace ID is correct (if using)

### 4. Deploy to Cloudflare

```bash
npm run deploy
```

Or directly:
```bash
npx wrangler deploy
```

### 5. Test Deployment

After deployment, you'll see output like:
```
Published audio-gen (X.XX sec)
  https://audio-gen.your-subdomain.workers.dev
```

Test the health endpoint:
```bash
curl https://audio-gen.your-subdomain.workers.dev/health
```

### 6. Run Full Tests

Use the provided test script:

```bash
./test.sh https://audio-gen.your-subdomain.workers.dev
```

Or test manually:

#### Test Audio Generation
```bash
curl -X POST https://audio-gen.your-subdomain.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "text": "Hello, this is a test of the audio generation system.",
    "save_to_r2": true
  }' | jq '.'
```

#### Test Voice Listing
```bash
curl https://audio-gen.your-subdomain.workers.dev/voices | jq '.'
```

## Troubleshooting

### Issue: "R2_BUCKET binding not configured"

**Solution:** Ensure the R2 bucket exists and is properly bound in wrangler.toml:
```bash
npx wrangler r2 bucket create living-arts
```

### Issue: "Invalid ElevenLabs API key"

**Solution:** Verify the secret is set correctly:
```bash
npx wrangler secret list
```

If not present, add it:
```bash
npx wrangler secret put ELEVENLABS_API_KEY
```

### Issue: "D1 database not found"

**Solution:** The D1 binding is optional for MVP. If you don't have a D1 database, comment out the D1 binding in `wrangler.toml`:
```toml
# [[d1_databases]]
# binding = "DB"
# database_name = "multiagent_system"
# database_id = "7cff30a0-c974-4ede-b96a-c91dd2f0c870"
```

### Issue: "Rate limiter not found"

**Solution:** The rate limiter is optional. Comment out the durable object binding if you don't have it deployed:
```toml
# [[durable_objects.bindings]]
# name = "RATE_LIMITER"
# class_name = "RateLimiter"
# script_name = "rate-limiter"
```

## Custom Domain Setup

To set up a custom domain (e.g., `audio.distributedelectrons.com`):

### 1. Get Your Zone ID

```bash
npx wrangler zones list
```

### 2. Add Route to wrangler.toml

Uncomment and update the routes section:
```toml
routes = [
  { pattern = "audio.distributedelectrons.com/*", zone_id = "YOUR_ZONE_ID" }
]
```

### 3. Redeploy

```bash
npm run deploy
```

### 4. Configure DNS

In Cloudflare dashboard:
1. Go to your domain's DNS settings
2. Add a CNAME record:
   - Name: `audio`
   - Target: `your-subdomain.workers.dev`
   - Proxy status: Proxied (orange cloud)

## Monitoring

### View Live Logs

```bash
npm run tail
```

Or:
```bash
npx wrangler tail
```

### View Metrics

Visit the Cloudflare dashboard:
1. Go to Workers & Pages
2. Select `audio-gen`
3. View the Metrics tab

## Environment-Specific Deployments

### Development Environment

```bash
npx wrangler dev
```

This runs locally on `http://localhost:8787`

### Staging Environment

Create a `wrangler.staging.toml`:
```toml
name = "audio-gen-staging"
# ... copy other settings from wrangler.toml
```

Deploy to staging:
```bash
npx wrangler deploy --config wrangler.staging.toml
```

### Production Environment

Use the default `wrangler.toml` for production:
```bash
npm run deploy
```

## Post-Deployment Checklist

- [ ] Health endpoint returns 200
- [ ] Can list voices
- [ ] Can generate audio successfully
- [ ] Audio files are stored in R2
- [ ] Audio files are accessible via CDN URL
- [ ] CORS headers are present
- [ ] Error handling works correctly
- [ ] Logs are being captured
- [ ] Custom domain is working (if configured)

## Cost Monitoring

Monitor usage to manage costs:

1. **Cloudflare Workers:** Free tier includes 100k requests/day
2. **R2 Storage:** Free tier includes 10GB storage
3. **ElevenLabs:** Check character usage in logs and ElevenLabs dashboard

## Rollback

If you need to rollback to a previous version:

```bash
npx wrangler rollback
```

## Next Steps

1. Integrate with Living Arts video production app
2. Set up monitoring and alerting
3. Configure rate limiting per instance
4. Implement usage analytics
5. Add more voice options and customization

## Support

For issues:
- Check Cloudflare Workers logs: `npx wrangler tail`
- Review ElevenLabs API status: https://status.elevenlabs.io/
- GitHub issues: https://github.com/CyberBrown/cloudflare-multiagent-system/issues
