# Render Service Worker

A Cloudflare Worker that integrates with Shotstack for video rendering. This service converts our internal timeline format to Shotstack's format and manages the rendering lifecycle.

## Features

- Timeline format conversion (Our format → Shotstack format)
- Video rendering job management
- Webhook handling for render completion
- Automatic upload to R2 storage
- Status tracking and progress monitoring
- CORS support for browser clients

## Architecture

```
workers/render-service/
├── src/
│   ├── index.ts              # Main worker entry with routes
│   ├── providers/
│   │   └── shotstack.ts      # Shotstack API adapter
│   ├── timeline/
│   │   └── converter.ts      # Timeline format converter
│   ├── auth.ts               # Authentication middleware
│   └── types.ts              # TypeScript definitions
├── wrangler.toml             # Cloudflare configuration
├── package.json
├── tsconfig.json
└── README.md
```

## API Endpoints

### POST /render

Submit a video for rendering.

**Request:**
```json
{
  "instance_id": "string",
  "project_id": "string",
  "timeline": {
    "duration": 180,
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "tracks": {
      "video": [{
        "id": "video-track-1",
        "clips": [{
          "id": "clip-1",
          "type": "stock",
          "src": "https://r2-url/video.mp4",
          "start": 0,
          "duration": 10,
          "transition": { "type": "fade", "duration": 0.5 }
        }]
      }],
      "audio": [],
      "overlay": []
    }
  },
  "options": {
    "format": "mp4",
    "resolution": "hd",
    "webhook_url": "https://your-app.com/webhooks/render"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "render_id": "shotstack-job-id",
    "status": "queued",
    "estimated_time": 30,
    "webhook_configured": true
  },
  "request_id": "uuid",
  "timestamp": "2024-12-02T12:00:00Z"
}
```

### GET /status/:render_id

Check the status of a render job.

**Response:**
```json
{
  "success": true,
  "data": {
    "render_id": "shotstack-job-id",
    "status": "rendering",
    "progress": 50,
    "url": null
  }
}
```

**Status values:**
- `queued` - Job is queued (10%)
- `fetching` - Fetching assets (25%)
- `rendering` - Actively rendering (50%)
- `saving` - Saving output (75%)
- `done` - Render complete (100%)
- `failed` - Render failed (0%)

### POST /webhook

Receives callbacks from Shotstack when renders complete.

This endpoint:
1. Updates job status in KV storage
2. Downloads the rendered video from Shotstack CDN
3. Uploads the video to R2 storage
4. Forwards the webhook to your application (if configured)

**Webhook payload sent to your app:**
```json
{
  "render_id": "shotstack-job-id",
  "project_id": "project-123",
  "instance_id": "instance-456",
  "status": "completed",
  "r2_key": "renders/project-123/shotstack-job-id.mp4",
  "shotstack_url": "https://cdn.shotstack.io/output.mp4"
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
    "service": "render-service",
    "timestamp": "2024-12-02T12:00:00Z"
  }
}
```

## Timeline Format

Our timeline format is designed to be simple and intuitive:

```typescript
interface OurTimeline {
  duration: number;           // Total duration in seconds
  resolution: {
    width: number;
    height: number;
  };
  fps: number;               // Frames per second
  tracks: {
    video: VideoTrack[];     // Video clips (layered bottom to top)
    audio: AudioTrack[];     // Audio clips
    overlay: OverlayTrack[]; // Text/HTML overlays (rendered on top)
  };
  soundtrack?: {             // Background music
    src: string;
    volume?: number;
    fadeIn?: number;
    fadeOut?: number;
  };
}
```

The converter automatically translates this to Shotstack's format, handling:
- Track layering (overlays on top, then video, then audio)
- Transition effects
- Volume controls
- Fade in/out for soundtrack
- Position mapping for overlays

## Setup

### 1. Install Dependencies

```bash
cd workers/render-service
npm install
```

### 2. Create KV Namespace

```bash
npx wrangler kv:namespace create RENDER_JOBS
```

Copy the namespace ID from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RENDER_JOBS"
id = "YOUR_NAMESPACE_ID_HERE"
```

### 3. Configure Secrets

```bash
npx wrangler secret put SHOTSTACK_API_KEY
# Enter: uZdyBrEG7rXXCxs8diDzxUa5L6HBrjgUqpluBDlt
```

### 4. Deploy

```bash
npx wrangler deploy
```

## Development

Start the development server:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`.

## Testing

### Minimal Test

```bash
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "project_id": "test-project",
    "timeline": {
      "duration": 10,
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
            "duration": 10
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

### Check Status

```bash
curl http://localhost:8787/status/{render_id}
```

### Health Check

```bash
curl http://localhost:8787/health
```

## Configuration

### Environment Variables

Set in `wrangler.toml`:

- `SHOTSTACK_ENV` - Shotstack environment (`stage` for sandbox, `v1` for production)
- `CONFIG_SERVICE_URL` - URL of the config service

### Secrets

Set via `wrangler secret put`:

- `SHOTSTACK_API_KEY` - Your Shotstack API key

### Bindings

- `R2_BUCKET` - R2 bucket for storing rendered videos
- `DB` - D1 database (optional, for additional tracking)
- `PROVIDER_KEYS` - KV namespace for provider API keys
- `RENDER_JOBS` - KV namespace for render job tracking
- `RATE_LIMITER` - Durable Object for rate limiting (optional)

## Error Handling

The service handles various error cases:

- **400 Bad Request** - Invalid timeline or missing parameters
- **401 Unauthorized** - Invalid API key (when auth is enabled)
- **402 Payment Required** - Insufficient Shotstack credits
- **404 Not Found** - Render job not found
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Shotstack API error or processing error

## Monitoring

View logs in real-time:

```bash
npm run tail
```

Or view in the Cloudflare dashboard under Workers & Pages → render-service → Logs.

## Shotstack Integration

### Sandbox vs Production

- **Sandbox (stage)**: Free tier for testing, renders have watermark
- **Production (v1)**: Paid tier, no watermark

Update `SHOTSTACK_ENV` in `wrangler.toml` to switch environments.

### API Limits

- Sandbox: 20 renders per month
- Production: Based on your plan

### Webhook Configuration

When submitting a render with `webhook_url`, Shotstack will POST to that URL when the render completes. This worker automatically:

1. Receives the webhook
2. Downloads the video
3. Uploads to R2
4. Forwards to your app

## License

MIT
