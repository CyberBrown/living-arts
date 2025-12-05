#!/bin/bash
set -e

echo "🚀 Deploying render-service worker..."
echo ""

# Navigate to worker directory
cd "$(dirname "$0")"

# Check authentication
echo "📋 Checking authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "❌ Not authenticated with Cloudflare"
    echo "Please run: npx wrangler login"
    exit 1
fi
echo "✅ Authenticated"
echo ""

# Create KV namespace
echo "📦 Creating RENDER_JOBS KV namespace..."
KV_OUTPUT=$(npx wrangler kv:namespace create RENDER_JOBS)
echo "$KV_OUTPUT"

# Extract namespace ID from output
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+' || echo "")

if [ -z "$KV_ID" ]; then
    echo "⚠️  Could not automatically extract KV namespace ID"
    echo "Please update wrangler.toml manually with the ID shown above"
    echo ""
    read -p "Press Enter after updating wrangler.toml..."
else
    echo "✅ KV namespace created with ID: $KV_ID"
    echo ""

    # Update wrangler.toml
    echo "📝 Updating wrangler.toml..."
    sed -i "s/id = \"PLACEHOLDER_RENDER_JOBS_ID\"/id = \"$KV_ID\"/" wrangler.toml
    echo "✅ Updated wrangler.toml"
fi
echo ""

# Set Shotstack API key
echo "🔑 Setting SHOTSTACK_API_KEY secret..."
echo "uZdyBrEG7rXXCxs8diDzxUa5L6HBrjgUqpluBDlt" | npx wrangler secret put SHOTSTACK_API_KEY
echo "✅ Secret set"
echo ""

# Deploy worker
echo "🚢 Deploying worker..."
npx wrangler deploy
echo ""

echo "✅ Deployment complete!"
echo ""
echo "Your worker is now live. Test it with:"
echo "  curl https://render-service.YOUR_SUBDOMAIN.workers.dev/health"
