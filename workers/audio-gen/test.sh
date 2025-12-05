#!/bin/bash

# Test script for audio-gen worker
# Usage: ./test.sh [worker-url]

WORKER_URL="${1:-http://localhost:8787}"

echo "Testing audio-gen worker at: $WORKER_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health check
echo -e "${YELLOW}Test 1: Health Check${NC}"
curl -s -X GET "$WORKER_URL/health" | jq '.'
echo ""
echo ""

# Test 2: List voices
echo -e "${YELLOW}Test 2: List Available Voices${NC}"
curl -s -X GET "$WORKER_URL/voices" | jq '.data.voices[] | {name, voice_id, category}' | head -20
echo ""
echo ""

# Test 3: Generate audio with default settings
echo -e "${YELLOW}Test 3: Generate Audio (Default Voice)${NC}"
RESPONSE=$(curl -s -X POST "$WORKER_URL/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "project_id": "demo",
    "text": "Hello, this is a test of the audio generation system.",
    "save_to_r2": true
  }')

echo "$RESPONSE" | jq '.'

# Check if successful
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  AUDIO_URL=$(echo "$RESPONSE" | jq -r '.data.url')
  echo -e "${GREEN}✓ Audio generated successfully${NC}"
  echo "Audio URL: $AUDIO_URL"

  # Test 4: Try to fetch the audio file
  echo ""
  echo -e "${YELLOW}Test 4: Fetch Generated Audio${NC}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AUDIO_URL")
  if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ Audio file accessible (HTTP $HTTP_CODE)${NC}"
  else
    echo -e "${RED}✗ Audio file not accessible (HTTP $HTTP_CODE)${NC}"
  fi
else
  echo -e "${RED}✗ Audio generation failed${NC}"
fi

echo ""
echo ""

# Test 5: Generate with custom voice settings
echo -e "${YELLOW}Test 5: Generate Audio (Custom Settings)${NC}"
curl -s -X POST "$WORKER_URL/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "text": "This is a test with custom voice settings.",
    "options": {
      "voice_id": "Rachel",
      "model_id": "eleven_monolingual_v1",
      "stability": 0.7,
      "similarity_boost": 0.8
    },
    "save_to_r2": true
  }' | jq '.'

echo ""
echo ""

# Test 6: Error handling - missing text
echo -e "${YELLOW}Test 6: Error Handling (Missing Text)${NC}"
curl -s -X POST "$WORKER_URL/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "save_to_r2": true
  }' | jq '.'

echo ""
echo ""

# Test 7: Error handling - missing instance_id
echo -e "${YELLOW}Test 7: Error Handling (Missing Instance ID)${NC}"
curl -s -X POST "$WORKER_URL/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Test without instance ID",
    "save_to_r2": true
  }' | jq '.'

echo ""
echo -e "${GREEN}All tests completed!${NC}"
