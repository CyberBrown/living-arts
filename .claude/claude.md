# Living Arts

AI-powered educational video production platform on Cloudflare.

## Tech Stack

- **Frontend**: Qwik with QwikCity (directory-based routing)
- **Deployment**: Cloudflare Pages
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Background Jobs**: Cloudflare Workflows
- **External APIs**: Distributed Electrons API workers

## Related Repository

**Distributed Electrons API**: https://github.com/CyberBrown/distributed-electrons

Backend API workers that power the video production pipeline. Cloned locally at `/home/chris/distributed-electrons`.

### DE API Workers

| Worker | Status | Provider | Endpoint |
|--------|--------|----------|----------|
| `text-gen` | Deployed | Anthropic Claude (claude-sonnet-4-20250514) | https://text-gen.solamp.workers.dev |
| `audio-gen` | Deployed | ElevenLabs | https://audio-gen.solamp.workers.dev |
| `stock-media` | Deployed | Pexels | https://stock-media.solamp.workers.dev |
| `render-service` | Deployed | Shotstack (sandbox) | https://render-service.solamp.workers.dev |
| `image-gen` | Implemented | Ideogram | POST /image-gen/generate |

### API Keys (Cloudflare Secrets)

All secrets are stored in Cloudflare Workers secrets (not .env files):
- `text-gen`: ANTHROPIC_API_KEY
- `audio-gen`: ELEVENLABS_API_KEY
- `stock-media`: PEXELS_API_KEY
- `render-service`: SHOTSTACK_API_KEY (sandbox key)

## Project Structure

```
src/
├── routes/           # QwikCity pages and API endpoints
│   ├── index.tsx     # Main page with project creation form + live polling
│   ├── layout.tsx    # Root layout
│   ├── api/          # API endpoints
│   │   └── projects/ # GET /api/projects - project list for polling
│   └── demo/         # Demo components
├── workflows/        # Cloudflare Workflows
│   └── video-production.ts  # Main video production workflow
├── components/       # Reusable Qwik components
└── entry.*.tsx       # Entry points (SSR, dev, cloudflare-pages)

adapters/
└── cloudflare-pages/ # Cloudflare Pages adapter config

server/               # Build output (generated)
```

## Key Bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 Database | Project metadata storage (living-arts-db) |
| `STORAGE` | R2 Bucket | Video assets and timelines (living-arts) |
| `VIDEO_WORKFLOW` | Workflow | Video production pipeline |
| `ASSETS` | Assets | Static file serving |
| `TEXT_GEN_URL` | Variable | https://text-gen.solamp.workers.dev |
| `AUDIO_GEN_URL` | Variable | https://audio-gen.solamp.workers.dev |
| `STOCK_MEDIA_URL` | Variable | https://stock-media.solamp.workers.dev |
| `RENDER_SERVICE_URL` | Variable | https://render-service.solamp.workers.dev |

## Database Schema

**projects** - Video production projects
- `id`, `user_id`, `prompt`, `status`, `duration`
- `script_url`, `voiceover_url`, `timeline_url`, `output_url`
- `created_at`, `updated_at`

**project_assets** - Media assets per project
- `id`, `project_id`, `type`, `src`, `metadata`

Project statuses: `pending` -> `processing` -> `script_generated` -> `voiceover_generated` -> `timeline_assembled` -> `complete`

## Video Production Workflow

The `VideoProductionWorkflow` (`src/workflows/video-production.ts`) orchestrates:

1. **generate-script** - Call text-gen API (Claude Sonnet 4) to create video script with sections, narration, visual cues, and keywords
2. **generate-voiceover** - Synthesize narration audio via ElevenLabs
3. **gather-stock-media** - Find relevant stock footage via Pexels API
4. **assemble-timeline** - Combine voiceover + media into Shotstack timeline format
5. **submit-render** - Submit render job to Shotstack
6. **wait-for-render** - Poll Shotstack until render completes
7. **update-complete-status** - Mark project as complete with output URL

Typical workflow duration: ~55 seconds for a 1-minute video.

## Live Status Updates

The UI polls `/api/projects` every 2 seconds to show real-time workflow progress:
- Uses `useVisibleTask$` with `setInterval`
- New projects appear within 2 seconds of creation
- Status updates as workflow progresses through each step

## Development Commands

```bash
npm run dev          # Start dev server with SSR
npm run build        # Build for production
npm run deploy       # Build and deploy to Cloudflare
npm run serve        # Serve production build locally
npm run db:migrate   # Run D1 migrations
npm run cf-typegen   # Generate Cloudflare types
```

## Qwik Patterns

- Use `component$` for all components (enables resumability)
- Use `useSignal` for local state
- Use `useVisibleTask$` for client-side effects (polling, timers)
- Use `routeLoader$` for server-side data fetching
- Use `routeAction$` for form submissions and mutations
- Access Cloudflare bindings via `platform.env` in loaders/actions

## Code Style

- TypeScript strict mode
- Prettier for formatting (`npm run fmt`)
- ESLint with Qwik plugin (`npm run lint`)
- Prefer inline styles or CSS modules over global CSS

## MCP Developer Guides

This project follows the developer guidelines available via the MCP server. Key guides:

- **Qwik Development**: Component patterns, signals, resumability
- **Cloudflare Workers**: D1, R2, Workflows, environment bindings
- **Security**: Input validation, SQL injection prevention
- **Database**: Schema design, query optimization for D1

Use `search_developer_guides` to find relevant patterns before implementing new features.
