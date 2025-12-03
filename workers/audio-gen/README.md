# Audio Generation Worker

Audio generation worker for the Distributed Electrons platform, powered by ElevenLabs text-to-speech API.

## Overview

This Cloudflare Worker provides text-to-speech capabilities using ElevenLabs API, with automatic storage to R2 buckets. It's part of the multi-agent system designed for the Living Arts video production application.

## Features

- Text-to-speech generation using ElevenLabs
- Multiple voice options
- Configurable voice settings (stability, similarity boost)
- Audio storage in Cloudflare R2
- CDN-backed audio delivery
- Support for multiple output formats
- CORS-enabled for web applications
- Request tracking and error handling

## API Endpoints

### POST /generate

Generate speech from text and save to R2.

**Request:**
```json
{
  "instance_id": "your-instance-id",
  "project_id": "optional-project-id",
  "text": "The narration text to convert to speech",
  "options": {
    "voice_id": "Rachel",
    "model_id": "eleven_monolingual_v1",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "output_format": "mp3_44100_128"
  },
  "save_to_r2": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://audio-gen.distributedelectrons.com/audio/instance_id/project_id/audio/timestamp_hash.mp3",
    "r2_path": "instance_id/project_id/audio/timestamp_hash.mp3",
    "duration_seconds": 45.2,
    "character_count": 523,
    "metadata": {
      "voice_id": "Rachel",
      "model_id": "eleven_monolingual_v1",
      "provider": "elevenlabs"
    }
  },
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-12-02T18:30:00.000Z"
}
```

### GET /voices

List available voices from ElevenLabs.

**Response:**
```json
{
  "success": true,
  "data": {
    "voices": [
      {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",
        "name": "Rachel",
        "category": "premade",
        "labels": {
          "accent": "american",
          "age": "young",
          "gender": "female"
        }
      }
    ]
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "audio-gen",
  "r2_configured": true,
  "timestamp": "2024-12-02T18:30:00.000Z"
}
```

### GET /audio/{path}

Serve audio files from R2 storage. The path format is:
```
{instance_id}/{project_id}/audio/{timestamp}_{hash}.mp3
```

## Configuration

### Environment Variables

Set in `wrangler.toml`:
- `DEFAULT_VOICE_ID`: Default voice ID (default: "Rachel")
- `DEFAULT_MODEL_ID`: Default model ID (default: "eleven_monolingual_v1")
- `CONFIG_SERVICE_URL`: URL for config service

### Secrets

Set using Wrangler CLI:
```bash
wrangler secret put ELEVENLABS_API_KEY
```

Required secret:
- `ELEVENLABS_API_KEY`: Your ElevenLabs API key

### Bindings

- `R2_BUCKET`: R2 bucket for audio storage (bucket name: "living-arts")
- `DB`: D1 database (optional, for future use)
- `PROVIDER_KEYS`: KV namespace for provider API keys (optional)
- `RATE_LIMITER`: Durable Object for rate limiting (optional)

## Voice Options

### Supported Voices

ElevenLabs provides various pre-made voices. Popular options include:
- Rachel (default)
- Domi
- Bella
- Antoni
- Elli
- Josh
- Arnold
- Adam
- Sam

Use the `/voices` endpoint to get the full list of available voices.

### Voice Settings

- `stability` (0-1): Controls consistency. Higher = more stable, lower = more variable
- `similarity_boost` (0-1): Controls similarity to the original voice

### Output Formats

- `mp3_44100_128`: MP3 at 44.1kHz, 128kbps (default, best quality)
- `mp3_22050_32`: MP3 at 22.05kHz, 32kbps (smaller files)
- `pcm_16000`: PCM at 16kHz (raw audio)

## Storage Structure

Audio files are stored in R2 with the following path structure:
```
{instance_id}/{project_id}/audio/{timestamp}_{hash}.mp3
```

Metadata stored with each file:
- `voice_id`: Voice used for generation
- `model_id`: Model used
- `provider`: "elevenlabs"
- `duration_seconds`: Estimated duration
- `character_count`: Number of characters processed
- `generated_at`: ISO timestamp

## Error Handling

The worker handles various error scenarios:

- `400 INVALID_REQUEST`: Missing or invalid parameters
- `401 INVALID_API_KEY`: Invalid ElevenLabs API key
- `404 INSTANCE_NOT_FOUND`: Instance ID not found
- `422 INVALID_PARAMETERS`: Invalid voice_id or other parameters
- `429 PROVIDER_RATE_LIMIT`: ElevenLabs rate limit exceeded
- `500 MISSING_API_KEY`: API key not configured
- `503 SERVICE_UNAVAILABLE`: ElevenLabs service temporarily unavailable

## Development

### Prerequisites

- Node.js 18+
- Wrangler CLI
- ElevenLabs API key

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up secrets:
```bash
wrangler secret put ELEVENLABS_API_KEY
# Enter: sk_9e0d31dc45efc02ede8b1f2bb2629e4c3f67b7bc258f3e01
```

3. Run locally:
```bash
npm run dev
```

### Type Checking

```bash
npm run type-check
```

## Deployment

### Deploy to Cloudflare Workers

```bash
npm run deploy
```

Or directly:
```bash
npx wrangler deploy
```

### Test Deployment

```bash
curl -X POST https://audio-gen.YOUR_SUBDOMAIN.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "test",
    "text": "Hello, this is a test of the audio generation system.",
    "save_to_r2": true
  }'
```

## Testing Examples

### Generate Audio with Default Voice

```bash
curl -X POST https://audio-gen.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "living-arts-test",
    "project_id": "demo-video",
    "text": "Welcome to the Living Arts video production platform. This audio was generated using ElevenLabs text-to-speech technology.",
    "save_to_r2": true
  }'
```

### Generate Audio with Custom Voice Settings

```bash
curl -X POST https://audio-gen.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "living-arts-test",
    "text": "This narration uses a custom voice with specific settings for optimal clarity.",
    "options": {
      "voice_id": "Josh",
      "model_id": "eleven_monolingual_v1",
      "stability": 0.7,
      "similarity_boost": 0.8
    },
    "save_to_r2": true
  }'
```

### List Available Voices

```bash
curl -X GET https://audio-gen.workers.dev/voices
```

### Health Check

```bash
curl -X GET https://audio-gen.workers.dev/health
```

## Cost Considerations

ElevenLabs charges per character processed. The worker logs character counts for usage tracking:

- Character count is included in response
- Logged with each generation request
- Can be monitored through Cloudflare Workers logs

## Integration with Living Arts

This worker is designed to be consumed by the Living Arts video production app:

1. App sends narration text to `/generate`
2. Worker generates audio via ElevenLabs
3. Audio is stored in R2
4. CDN URL is returned to app
5. App can directly use the audio file in video production

## Monitoring

View logs:
```bash
npm run tail
```

Or:
```bash
wrangler tail
```

## Future Enhancements

- [ ] Streaming audio support
- [ ] Voice cloning integration
- [ ] Audio format conversion
- [ ] Better duration calculation (MP3 parsing)
- [ ] Rate limiting per instance
- [ ] Usage analytics and billing
- [ ] Webhook notifications on completion
- [ ] Support for multiple audio providers

## Architecture

The worker follows the established pattern from other Distributed Electrons workers:

- **Provider Adapter Pattern**: ElevenLabs integration in `src/providers/`
- **R2 Storage**: Uses R2 for scalable audio storage
- **Instance Configuration**: Mock implementation, ready for Config Service integration
- **CORS Support**: Enabled for web application access
- **Error Handling**: Comprehensive error handling with specific error codes

## Related Workers

- `text-gen`: Text generation using OpenAI/Anthropic
- `image-gen`: Image generation using Ideogram
- `rate-limiter`: Durable Object for rate limiting

## Support

For issues or questions:
- GitHub: https://github.com/CyberBrown/cloudflare-multiagent-system
- Documentation: See main repo README

## License

MIT
