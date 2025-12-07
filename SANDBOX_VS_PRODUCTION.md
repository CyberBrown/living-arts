# Sandbox vs Production Mode

The Living Arts platform supports two operating modes: **Sandbox** (for testing) and **Production** (for live deployments).

## How It Works

Each worker checks the `ENVIRONMENT` variable to determine which API keys to use:
- `ENVIRONMENT=sandbox` → Uses sandbox keys from wrangler.toml (default)
- `ENVIRONMENT=production` → Uses production keys from Cloudflare Secrets

## Default Mode: Sandbox

All workers are configured to use **sandbox mode by default**, which means:
- ✅ Sandbox API keys are in wrangler.toml and safe to commit to git
- ✅ No need to configure Cloudflare Secrets for testing
- ✅ Works immediately after `git clone`
- ✅ Perfect for development and testing

## Sandbox API Keys (Already Configured)

The following sandbox keys are already set in wrangler.toml:

| Service | Key | Location |
|---------|-----|----------|
| Anthropic (Claude) | `sk-ant-api03-vo8NMa...` | workers/video-workflow/wrangler.toml |
| ElevenLabs (TTS) | `c45cd678b8cadd...` | workers/audio-gen/wrangler.toml |
| Pexels (Stock Video) | `0YUqnYIeFO6y...` | workers/stock-media/wrangler.toml |
| Shotstack (Rendering) | `KraSrqll02W5...` | workers/render-service/wrangler.toml |

## Testing with Sandbox Mode

No special configuration needed! Just deploy:

```bash
# Deploy all workers in sandbox mode
cd workers/video-workflow && npx wrangler deploy
cd ../audio-gen && npx wrangler deploy
cd ../stock-media && npx wrangler deploy
cd ../render-service && npx wrangler deploy
```

The workers will automatically use the sandbox keys from wrangler.toml.

## Switching to Production Mode

When you're ready for production, follow these steps:

### 1. Set Production Secrets

Set production API keys as Cloudflare Secrets:

```bash
# Video Workflow - Anthropic API
cd workers/video-workflow
npx wrangler secret put ANTHROPIC_API_KEY
# Enter your production Anthropic API key

# Audio Gen - ElevenLabs API
cd ../audio-gen
npx wrangler secret put ELEVENLABS_API_KEY
# Enter your production ElevenLabs API key

# Stock Media - Pexels API
cd ../stock-media
npx wrangler secret put PEXELS_API_KEY
# Enter your production Pexels API key

# Render Service - Shotstack API
cd ../render-service
npx wrangler secret put SHOTSTACK_API_KEY
# Enter your production Shotstack API key
```

### 2. Update ENVIRONMENT Variable

In each worker's wrangler.toml, change:

```toml
[vars]
ENVIRONMENT = "sandbox"  # Change this to "production"
```

to:

```toml
[vars]
ENVIRONMENT = "production"
```

### 3. Redeploy

```bash
# Deploy all workers in production mode
cd workers/video-workflow && npx wrangler deploy
cd ../audio-gen && npx wrangler deploy
cd ../stock-media && npx wrangler deploy
cd ../render-service && npx wrangler deploy
```

Now the workers will use production secrets from Cloudflare instead of sandbox keys.

## Environment-Specific Deployments

You can have different environments by managing multiple wrangler.toml files or using wrangler environments:

### Option 1: Multiple Config Files (Recommended)

```bash
# Create production config
cp wrangler.toml wrangler.prod.toml

# Edit wrangler.prod.toml
# Change ENVIRONMENT = "production"

# Deploy to production
npx wrangler deploy --config wrangler.prod.toml
```

### Option 2: Wrangler Environments

```toml
# wrangler.toml
name = "video-workflow"

[env.sandbox]
vars = { ENVIRONMENT = "sandbox" }

[env.production]
vars = { ENVIRONMENT = "production" }
```

```bash
# Deploy to sandbox
npx wrangler deploy --env sandbox

# Deploy to production
npx wrangler deploy --env production
```

## Code Implementation

Each worker uses this pattern:

```typescript
// Use production key if ENVIRONMENT=production, otherwise use sandbox
const apiKey = env.ENVIRONMENT === 'production' && env.PRODUCTION_KEY
  ? env.PRODUCTION_KEY
  : env.SANDBOX_KEY;
```

This ensures:
- ✅ Backwards compatible with existing deployments
- ✅ Sandbox is default (safe for testing)
- ✅ Production requires explicit configuration
- ✅ No accidental production usage

## Security Best Practices

### Sandbox Mode
- ✅ Sandbox keys CAN be committed to git
- ✅ Sandbox keys should have rate limits
- ✅ Sandbox keys should use test/staging accounts
- ✅ Perfect for CI/CD pipelines

### Production Mode
- ❌ Production keys should NEVER be in git
- ✅ Production keys must be in Cloudflare Secrets
- ✅ Production keys should have proper monitoring
- ✅ Production keys should be rotated regularly

## Verifying Your Mode

Check which mode your worker is using:

```bash
# View current configuration
npx wrangler tail video-workflow --format pretty

# Make a test request and check logs
# Sandbox mode will log: "Using sandbox API key"
# Production mode will log: "Using production API key"
```

Or check the deployed environment variable:

```bash
npx wrangler whoami
# Shows your current account

# Check deployed vars (not secrets)
npx wrangler deployments list
```

## Cost Considerations

**Sandbox Mode:**
- Lower or no costs (depending on provider free tiers)
- Suitable for development and testing
- May have watermarks or limitations

**Production Mode:**
- Full costs apply
- No watermarks or limitations
- Production-grade quality and reliability

## Troubleshooting

### "API key not found" Error

If you get an API key error:

1. Check `ENVIRONMENT` variable in wrangler.toml
2. If `ENVIRONMENT=production`, ensure secrets are set:
   ```bash
   npx wrangler secret list
   ```
3. If `ENVIRONMENT=sandbox`, check sandbox key is in wrangler.toml

### "Invalid API key" Error

- **Sandbox mode**: Your sandbox key may have expired or been revoked
- **Production mode**: Check your Cloudflare Secret value
  ```bash
  npx wrangler secret delete OLD_KEY_NAME
  npx wrangler secret put NEW_KEY_NAME
  ```

### Accidentally Using Production Keys

If you accidentally deploy with production keys in sandbox mode:

1. Rotate your production keys immediately
2. Update Cloudflare Secrets with new keys
3. Check your billing for unexpected usage

## Quick Reference

| Task | Command |
|------|---------|
| Deploy sandbox | `npx wrangler deploy` (default) |
| Deploy production | Change `ENVIRONMENT="production"` in wrangler.toml, then `npx wrangler deploy` |
| Set production secret | `npx wrangler secret put KEY_NAME` |
| List secrets | `npx wrangler secret list` |
| Delete secret | `npx wrangler secret delete KEY_NAME` |
| Check current mode | Check `ENVIRONMENT` in deployed worker's wrangler.toml |

## Summary

- **Sandbox (Default)**: Keys in wrangler.toml, safe to commit, perfect for testing
- **Production**: Keys in Cloudflare Secrets, explicit opt-in, for live deployments
- **Switching**: Just change `ENVIRONMENT` variable and set secrets
- **Security**: Sandbox keys are safe in git, production keys never are
