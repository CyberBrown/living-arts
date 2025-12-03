#!/bin/bash
set -e

echo "=== Living Arts Pages Deployment ==="
echo ""

# Step 1: Apply database migration
echo "Step 1: Applying database migration..."
npx wrangler d1 execute living-arts-db --remote --file=migrations/0001_add_workflow_id.sql || {
    echo "⚠️  Migration may have already been applied or failed"
    echo "   Continuing with deployment..."
}

echo ""
echo "Step 2: Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name living-arts

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Next steps:"
echo "1. Go to your Cloudflare Pages dashboard"
echo "2. Configure bindings for your living-arts project:"
echo "   - D1 Database: DB → living-arts-db"
echo "   - R2 Bucket: STORAGE → living-arts"
echo "   - Environment Variable: VIDEO_WORKFLOW_URL → https://video-workflow.solamp.workers.dev"
echo ""
echo "3. Test your deployment at the provided URL"
