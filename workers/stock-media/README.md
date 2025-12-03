# Stock Media Worker

Cloudflare Worker for integrating with the Pexels API to search and download stock video footage for the Distributed Electrons platform.

## Features

- Search for stock videos by keywords
- Download videos directly to R2 storage
- Batch search for multiple queries
- Built-in caching to reduce API calls
- Attribution tracking (required by Pexels TOS)
- Instance and project-based authentication

## API Endpoints

### POST /search

Search for stock videos by keywords.

**Request:**
```json
{
  "instance_id": "string",
  "query": "solar panels installation",
  "options": {
    "orientation": "landscape | portrait | square (optional)",
    "size": "large | medium | small (optional)",
    "per_page": "number 1-80 (optional, default: 15)",
    "page": "number (optional, default: 1)"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_results": 1234,
    "page": 1,
    "per_page": 15,
    "videos": [
      {
        "id": 12345,
        "width": 1920,
        "height": 1080,
        "duration": 15,
        "url": "https://www.pexels.com/video/...",
        "image": "https://images.pexels.com/videos/...",
        "video_files": [
          {
            "id": 67890,
            "quality": "hd",
            "file_type": "video/mp4",
            "width": 1920,
            "height": 1080,
            "link": "https://videos.pexels.com/..."
          }
        ],
        "user": {
          "name": "Photographer Name",
          "url": "https://www.pexels.com/@username"
        }
      }
    ]
  },
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### POST /download

Download a video and save to R2 storage.

**Request:**
```json
{
  "instance_id": "string",
  "project_id": "string",
  "video_id": 12345,
  "options": {
    "quality": "hd | sd | uhd (optional, default: hd)",
    "max_duration": "number in seconds (optional)"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://stock-media.distributedelectrons.com/video/...",
    "r2_path": "instance_id/project_id/stock/pexels_12345.mp4",
    "duration": 15,
    "width": 1920,
    "height": 1080,
    "size_bytes": 15234567,
    "attribution": {
      "photographer": "Name",
      "photographer_url": "https://www.pexels.com/@username",
      "source": "Pexels",
      "source_url": "https://www.pexels.com/video/12345"
    }
  },
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### POST /batch-search

Search multiple queries at once (useful for video scripts with multiple sections).

**Request:**
```json
{
  "instance_id": "string",
  "queries": [
    { "id": "section-1", "query": "solar panels", "per_page": 5 },
    { "id": "section-2", "query": "wind turbines", "per_page": 5 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": {
      "section-1": { "videos": [...] },
      "section-2": { "videos": [...] }
    }
  },
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "stock-media",
    "version": "1.0.0"
  },
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

## Setup

### 1. Install Dependencies

```bash
cd workers/stock-media
npm install
```

### 2. Create KV Namespace

```bash
npx wrangler kv:namespace create SEARCH_CACHE
```

Update the `id` in `wrangler.toml` with the namespace ID returned.

### 3. Set API Key Secret

```bash
npx wrangler secret put PEXELS_API_KEY
# Enter: 0YUqnYIeFO6yMiRij6r518zW4ttF05lETfIJYMQqHw2nsEYCq2XGn0km
```

### 4. Deploy

```bash
npx wrangler deploy
```

## Development

Run the worker locally:

```bash
npm run dev
```

## Testing

### Search for Videos

```bash
curl -X POST https://stock-media.YOUR_SUBDOMAIN.workers.dev/search \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "query": "solar energy",
    "options": { "per_page": 5 }
  }'
```

### Download a Video

```bash
curl -X POST https://stock-media.YOUR_SUBDOMAIN.workers.dev/download \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "project_id": "test-project",
    "video_id": 3571264
  }'
```

### Batch Search

```bash
curl -X POST https://stock-media.YOUR_SUBDOMAIN.workers.dev/batch-search \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "queries": [
      { "id": "intro", "query": "sunrise", "per_page": 3 },
      { "id": "main", "query": "technology", "per_page": 3 }
    ]
  }'
```

### Health Check

```bash
curl https://stock-media.YOUR_SUBDOMAIN.workers.dev/health
```

## Implementation Notes

### Video Quality Selection

The worker automatically selects the best video file based on the requested quality:
- **HD**: Prefers 1920x1080
- **SD**: Standard definition fallback
- **UHD**: Ultra HD when available

Falls back to available qualities if the preferred quality is not available.

### Streaming Download

Large video files are streamed directly from Pexels to R2 to avoid buffering in worker memory:

```typescript
const response = await fetch(videoUrl);
await env.R2_BUCKET.put(path, response.body, {
  httpMetadata: { contentType: 'video/mp4' }
});
```

### Attribution

Pexels requires attribution. The worker stores attribution data in R2 metadata and returns it in download responses.

### Rate Limits

Pexels API limits on the free tier:
- 200 requests/hour
- 20,000 requests/month

The worker implements caching (1-hour TTL) to reduce API calls.

### Error Handling

Common error responses:
- `400`: Missing required fields
- `403`: Invalid instance_id or project_id
- `404`: Video not found
- `429`: Rate limited by Pexels
- `500`: Internal server error

## R2 Storage

Videos are stored in the following path format:

```
{instance_id}/{project_id}/stock/pexels_{video_id}.mp4
```

Each video includes metadata with attribution information.

## Architecture

```
workers/stock-media/
├── src/
│   ├── index.ts              # Main worker entry
│   ├── providers/
│   │   ├── pexels.ts         # Pexels adapter
│   │   └── types.ts          # Provider types
│   ├── auth.ts               # Auth middleware
│   └── types.ts              # Request/response types
├── wrangler.toml             # Worker configuration
├── package.json
├── tsconfig.json
└── README.md
```

## License

Part of the Distributed Electrons platform.
