#!/bin/bash
# Test script for video workflow
# Tests each step of the pipeline independently

API_KEY="la_dev_DA77A783DF877D0A07D2EC815E6D8A3F"
BASE_URL="https://video-workflow.solamp.workers.dev"

echo "=== Video Workflow Integration Test ==="
echo ""

# Test 1: Health check on video-workflow
echo "1. Testing video-workflow health..."
HEALTH=$(curl -s "$BASE_URL/health")
echo "   Response: $HEALTH"
echo ""

# Test 2: Health check on audio-gen
echo "2. Testing audio-gen health..."
AUDIO_HEALTH=$(curl -s "https://audio-gen.solamp.workers.dev/health")
echo "   Response: $AUDIO_HEALTH"
echo ""

# Test 3: Health check on stock-media
echo "3. Testing stock-media health..."
STOCK_HEALTH=$(curl -s "https://stock-media.solamp.workers.dev/health")
echo "   Response: $STOCK_HEALTH"
echo ""

# Test 4: Health check on render-service
echo "4. Testing render-service health..."
RENDER_HEALTH=$(curl -s "https://render-service.solamp.workers.dev/health")
echo "   Response: $RENDER_HEALTH"
echo ""

# Test 5: Test audio-gen with API key
echo "5. Testing audio-gen /generate endpoint..."
AUDIO_TEST=$(curl -s -X POST "https://audio-gen.solamp.workers.dev/generate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "instance_id": "living-arts",
    "project_id": "test-project",
    "text": "Hello, this is a test.",
    "options": {
      "voice_id": "21m00Tcm4TlvDq8ikWAM",
      "model_id": "eleven_multilingual_v2"
    }
  }')
echo "   Response: $AUDIO_TEST"
echo ""

# Test 6: Test stock-media with API key
echo "6. Testing stock-media /search endpoint..."
STOCK_TEST=$(curl -s -X POST "https://stock-media.solamp.workers.dev/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "instance_id": "living-arts",
    "query": "nature landscape",
    "options": { "per_page": 2 }
  }')
echo "   Response: $STOCK_TEST" | head -c 500
echo "..."
echo ""

# Test 7: Start a full workflow
echo "7. Starting full video workflow..."
PROJECT_ID="test-$(date +%s)"
WORKFLOW_START=$(curl -s -X POST "$BASE_URL/start" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"prompt\": \"A beautiful sunset over the ocean\",
    \"duration\": 30
  }")
echo "   Project ID: $PROJECT_ID"
echo "   Response: $WORKFLOW_START"
echo ""

# Test 8: Check workflow status
echo "8. Checking workflow status (waiting 10 seconds)..."
sleep 10
STATUS=$(curl -s "$BASE_URL/status/$PROJECT_ID")
echo "   Status: $STATUS"
echo ""

echo "=== Test Complete ==="
