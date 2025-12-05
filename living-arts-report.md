# Living Arts - MVP Report

## Executive Summary

Living Arts is an AI-powered video production platform that automatically transforms text prompts into complete, rendered videos. Built on Cloudflare's edge infrastructure, it orchestrates multiple AI services through a distributed workflow system to generate scripts, voiceovers, and assemble stock footage into polished video content.

**MVP Status:** ✅ Complete  
**First Successful Render:** December 3, 2025  
**Total Development Time:** ~2 sessions

---

## What We Built

### The Pipeline

```
User Prompt → Script Generation → Voiceover → Stock Media → Timeline Assembly → Video Render → Final Output
     │              │                 │            │              │                │
     │         Claude API        ElevenLabs    Pexels API    Internal         Shotstack
     │                                                       Logic
     └─────────────────────────── Cloudflare Workers Workflow ───────────────────────────┘
```

### Architecture Overview

Living Arts uses a **hybrid architecture** combining Cloudflare Pages (UI) with Cloudflare Workers (backend processing):

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Living Arts Architecture                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐                                                       │
│   │ Living Arts  │  Qwik Frontend                                        │
│   │    Pages     │  https://living-arts.pages.dev                        │
│   └──────┬───────┘                                                       │
│          │                                                               │
│          ▼                                                               │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │              video-workflow (Cloudflare Workflows)                │  │
│   │   https://video-workflow.solamp.workers.dev                       │  │
│   │                                                                   │  │
│   │   Endpoints:                                                      │  │
│   │   • POST /start - Trigger new video production                    │  │
│   │   • GET /status/:id - Check workflow status                       │  │
│   │   • POST /webhook - Receive render callbacks                      │  │
│   │                                                                   │  │
│   │   Workflow Steps:                                                 │  │
│   │   1. generate-script      → Claude API (Anthropic)                │  │
│   │   2. generate-voiceover   → audio-gen worker → ElevenLabs         │  │
│   │   3. gather-stock-media   → stock-media worker → Pexels           │  │
│   │   4. assemble-timeline    → Internal logic                        │  │
│   │   5. render-video         → render-service worker → Shotstack     │  │
│   │   6. update-status        → D1 Database                           │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│          │                                                               │
│          ├──────────────┬──────────────┬──────────────┐                 │
│          ▼              ▼              ▼              ▼                 │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│   │ audio-gen │  │stock-media│  │  render-  │  │    D1     │           │
│   │  worker   │  │  worker   │  │  service  │  │ Database  │           │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘           │
│        │              │              │              │                   │
│        ▼              ▼              ▼              ▼                   │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│   │ElevenLabs │  │  Pexels   │  │ Shotstack │  │    R2     │           │
│   │    API    │  │    API    │  │    API    │  │  Storage  │           │
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Deployed Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Living Arts UI** | https://living-arts.pages.dev | Qwik frontend |
| **video-workflow** | https://video-workflow.solamp.workers.dev | Workflow orchestrator |
| **audio-gen** | https://audio-gen.solamp.workers.dev | ElevenLabs voice synthesis |
| **stock-media** | https://stock-media.solamp.workers.dev | Pexels video search |
| **render-service** | https://render-service.solamp.workers.dev | Shotstack video rendering |

### Data Storage

| Resource | Type | Purpose |
|----------|------|---------|
| **living-arts-db** | D1 | Project state, scripts, timelines |
| **living-arts** | R2 | Audio files, rendered assets |
| **SEARCH_CACHE** | KV | Stock media search caching |
| **RENDER_CACHE** | KV | Render job status caching |

---

## Cloudflare Workers Workflows: Deep Dive

### Why Workflows?

We chose Cloudflare Workflows over a simple Worker chain because video production has:
- **Long-running operations** (voiceover generation: 10-15s, rendering: 30-60s)
- **Multiple failure points** (external API calls to 4 different services)
- **State management needs** (tracking progress through 6+ steps)
- **Retry requirements** (API rate limits, transient failures)

### How We Used Workflows

The `VideoProductionWorkflow` class extends Cloudflare's `WorkflowEntrypoint`:

```typescript
export class VideoProductionWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { projectId, prompt, duration } = event.payload;
    
    // Step 1: Generate Script
    const script = await step.do("generate-script", async () => {
      // Direct Claude API call
    });
    
    // Step 2: Generate Voiceover
    const voiceover = await step.do("generate-voiceover", {
      retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
      timeout: "5 minutes"
    }, async () => {
      // Call audio-gen worker
    });
    
    // ... additional steps
  }
}
```

### What Worked Well

1. **Automatic State Persistence**
   - Each `step.do()` result is automatically persisted
   - If workflow crashes after step 3, it resumes from step 4
   - No manual checkpointing needed

2. **Built-in Retry Logic**
   - Configurable per-step: `retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }`
   - ElevenLabs rate limits? Automatic retry with backoff
   - Pexels timeout? Retry without losing script generation

3. **Visibility & Debugging**
   - Cloudflare dashboard shows all workflow instances
   - Each step's status, timing, and errors visible
   - Made debugging the timeline_json column error trivial

4. **Timeout Handling**
   - Per-step timeouts prevent hung workflows
   - Voiceover: 5 minutes, Render: 10 minutes
   - Long enough for real work, short enough to fail fast

5. **Worker-to-Worker Communication**
   - Clean separation: workflow orchestrates, workers execute
   - Each worker can be tested/deployed independently
   - audio-gen doesn't know about stock-media

### Challenges & Lessons Learned

1. **D1 Schema Alignment**
   - Workflow expected columns that didn't exist (`timeline_json`, `script_json`)
   - **Lesson:** Define schema upfront, or make workers defensive

2. **Pages vs Workers Limitation**
   - Cloudflare Pages doesn't support Workflow bindings
   - **Solution:** Hybrid architecture - Pages for UI, Worker for workflow
   - **Lesson:** Check binding support before architecture decisions

3. **Step Output Types**
   - Workflow steps return serializable data only
   - Can't pass complex objects between steps
   - **Lesson:** Design for JSON-serializable interfaces

4. **External API Integration**
   - Each external service (Claude, ElevenLabs, Pexels, Shotstack) has different:
     - Auth methods
     - Rate limits
     - Response formats
   - **Lesson:** Wrap each in a dedicated worker for isolation

### How Workflows Enable Future Features

The workflow architecture makes adding new features straightforward:

**Adding AI Image Generation:**
```typescript
// Just add a new step
const aiImages = await step.do("generate-ai-images", async () => {
  // Call new image-gen worker
});
```

**Adding Music:**
```typescript
const soundtrack = await step.do("select-soundtrack", async () => {
  // Call music-selection worker
});
// Update timeline assembly to include audio track
```

**Adding QC Review:**
```typescript
const qcResult = await step.do("quality-check", async () => {
  // Call QC worker that analyzes rough cut
});
if (!qcResult.passed) {
  // Workflow can branch or retry
}
```

**Provider Switching:**
The worker abstraction means switching providers requires zero workflow changes:
- Want to use Runway instead of Shotstack? Update render-service worker
- Want Murf.ai instead of ElevenLabs? Update audio-gen worker
- Workflow code stays identical

---

## Current Capabilities

### What MVP Does

✅ Takes a text prompt and target duration  
✅ Generates a structured video script via Claude  
✅ Creates professional voiceover via ElevenLabs  
✅ Finds relevant stock footage via Pexels  
✅ Assembles timeline with proper timing  
✅ Renders final video via Shotstack  
✅ Returns downloadable MP4 URL  

### Sample Output

**Input:**
```json
{
  "projectId": "demo-1",
  "prompt": "Why homeowners should invest in solar panels",
  "duration": 60
}
```

**Output:**
- 60-second video with:
  - 6 sections of narration (~150 words total)
  - 6 stock video clips with fade transitions
  - Professional voiceover
  - MP4 format, 1080p

### API Usage

**Start a Video Production:**
```bash
curl -X POST https://video-workflow.solamp.workers.dev/start \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-video",
    "prompt": "Benefits of renewable energy",
    "duration": 60
  }'
```

**Check Status:**
```bash
curl https://video-workflow.solamp.workers.dev/status/my-video
```

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| End-to-end time (60s video) | ~45-90 seconds |
| Script generation | ~10 seconds |
| Voiceover generation | ~12-15 seconds |
| Stock media search | <1 second |
| Timeline assembly | <1 second |
| Video rendering | ~20-45 seconds |

---

## Known Limitations (MVP)

1. **Voiceover Quality** - API output differs from ElevenLabs UI quality
2. **No Music** - Videos have voiceover only, no soundtrack
3. **Basic Transitions** - Fade only, no advanced effects
4. **No Text Overlays** - Pure video + audio
5. **Shotstack Watermark** - Using sandbox API key
6. **Hardcoded Secrets** - API keys in code (security risk)
7. **No Auth** - APIs are publicly accessible
8. **Stock Media Only** - No AI-generated imagery yet

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Qwik |
| Backend | Cloudflare Workers |
| Orchestration | Cloudflare Workflows |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Caching | Cloudflare KV |
| Script Generation | Claude API (Anthropic) |
| Voice Synthesis | ElevenLabs API |
| Stock Media | Pexels API |
| Video Rendering | Shotstack API |
| Package Manager | Bun |

---

## Conclusion

Living Arts MVP demonstrates a fully functional AI video production pipeline built on Cloudflare's edge infrastructure. The Workflows system proved ideal for orchestrating long-running, multi-step processes with external dependencies. The modular worker architecture sets up well for rapid feature iteration - adding new capabilities means adding new workers and workflow steps, not rewriting the core system.

The next phase focuses on production hardening (secrets, auth) and feature enhancement (AI imagery, music, text overlays) to transform this MVP into a client-ready product.
