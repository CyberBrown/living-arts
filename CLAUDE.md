# Living Arts - Claude Code Guide

AI-powered video production platform on Cloudflare.

## Tech Stack

- **Frontend**: Qwik + QwikCity (Cloudflare Pages)
- **Backend**: 4 Cloudflare Workers (video-workflow, audio-gen, stock-media, render-service)
- **Database**: Cloudflare D1 (living-arts-db)
- **Storage**: Cloudflare R2
- **Orchestration**: Cloudflare Workflows
- **External APIs**: Anthropic (scripts), ElevenLabs (voiceover), Pexels (stock), Shotstack (render)

## Key Commands

```bash
# Development
npm start                    # Start dev server
npm run build               # Production build
npm run deploy              # Deploy to Cloudflare Pages

# Database
npm run db:migrate          # Run D1 migrations

# Workers (from each worker directory)
bunx wrangler deploy        # Deploy worker
wrangler secret put <NAME>  # Set secrets
```

## Project Structure

```
src/
  routes/index.tsx          # Main UI - project creation, status, preview
  workflows/video-production.ts  # Workflow pipeline definition
workers/
  video-workflow/           # Orchestrator - calls other workers
  audio-gen/                # ElevenLabs TTS
  stock-media/              # Pexels search
  render-service/           # Shotstack rendering
migrations/                 # D1 database migrations
```

## Authentication

All worker endpoints require `x-api-key` header. Keys stored in D1 `api_keys` table.
Exemptions: `/health` and `/webhook` endpoints.

## Required Secrets

| Worker | Secret |
|--------|--------|
| video-workflow | ANTHROPIC_API_KEY |
| audio-gen | ELEVENLABS_API_KEY |
| stock-media | PEXELS_API_KEY |
| render-service | SHOTSTACK_API_KEY |

## Workflow Pipeline

1. User submits topic + duration
2. Claude generates educational script
3. ElevenLabs creates voiceover
4. Pexels provides stock footage
5. Timeline assembled with text overlays
6. Shotstack renders final video

## Key Documentation

- `SECURITY_DEPLOYMENT.md` - Security setup & API keys
- `TODO.md` - Prioritized feature backlog
- `P1_COMPLETION_REPORT.md` - Feature verification
- `living-arts-report.md` - Architecture overview

## Status

- **P0 Security**: Complete (API key auth on all workers)
- **P1 Demo-Ready**: Complete (UI, voiceover quality, text overlays)
- **P2 Features**: Pending (music, AI images, transitions)
