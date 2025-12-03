# Living Arts - TODO

> Last Updated: December 3, 2025

## Priority Legend
- 🔴 **P0** - Do immediately (security/blocking)
- 🟠 **P1** - Do next (demo-ready)
- 🟡 **P2** - High impact features
- 🟢 **P3** - Polish & enhancement
- 🔵 **P4** - Future/nice-to-have

---

## 🔴 P0: Security & Stability

- [ ] **Move secrets to Cloudflare Secrets**
  - [ ] Anthropic API key (currently hardcoded in video-production.ts)
  - [ ] ElevenLabs API key
  - [ ] Pexels API key  
  - [ ] Shotstack API key
  - [ ] Update wrangler.toml files to reference secrets
  
- [ ] **Add basic authentication**
  - [ ] API key auth for all worker endpoints
  - [ ] Store valid API keys in KV or D1
  - [ ] Return 401 for unauthenticated requests

---

## 🟠 P1: Demo-Ready

- [ ] **Fix voiceover quality**
  - [ ] Investigate ElevenLabs API parameters (stability, similarity_boost, style)
  - [ ] Compare API output vs UI output settings
  - [ ] Test different models (eleven_multilingual_v2, eleven_turbo_v2)
  - [ ] Add voice settings to API request

- [ ] **UI polish for client demos**
  - [ ] Project creation form
  - [ ] Progress/status display
  - [ ] Video preview player
  - [ ] Project history list
  - [ ] Basic styling/branding

- [ ] **Add text overlays**
  - [ ] Title card at video start
  - [ ] Section headers/lower thirds
  - [ ] Call-to-action end card
  - [ ] Update Shotstack timeline format

---

## 🟡 P2: Core Features

- [ ] **Add soundtrack/music**
  - [ ] Stock music provider integration (Epidemic Sound, Artlist, or free alternatives)
  - [ ] OR generative music API (Mubert, AIVA)
  - [ ] Music selection based on video mood/topic
  - [ ] Audio mixing (voiceover + music balance)
  - [ ] Update timeline assembly for dual audio tracks

- [ ] **AI generated images**
  - [ ] Integrate image generation API (DALL-E, Midjourney API, Ideogram)
  - [ ] Create image-gen worker
  - [ ] Generate images for concepts not found in stock
  - [ ] Use as fallback when stock search returns poor results
  - [ ] Add to timeline as static image clips

- [ ] **AI generated video**
  - [ ] Integrate video generation API (Runway, Pika, Kling)
  - [ ] Create video-gen worker  
  - [ ] Decision logic: when to use AI vs stock
    - [ ] Stock quality scoring
    - [ ] Keyword match confidence
    - [ ] Scene complexity analysis
  - [ ] Toggle for cost control (AI video is expensive)
  - [ ] Leverage Cloudflare Workers for parallel generation

- [ ] **Transition effects**
  - [ ] Cross-dissolve
  - [ ] Wipe transitions
  - [ ] Zoom/Ken Burns effect on images
  - [ ] Match transitions to video mood

- [ ] **Captions/subtitles**
  - [ ] Auto-generate from narration text
  - [ ] SRT file generation
  - [ ] Burned-in captions option
  - [ ] Caption styling options

---

## 🟢 P3: Quality & Polish

- [ ] **QC review stage**
  - [ ] Automated checks:
    - [ ] Audio levels/clipping detection
    - [ ] Video-to-narration timing alignment  
    - [ ] Spelling check on any text overlays
    - [ ] Stock footage relevance scoring
  - [ ] Generate "rough cut" before final render
  - [ ] QC report with pass/fail and issues
  - [ ] Auto-fix common issues OR flag for human review

- [ ] **Audio mixing**
  - [ ] Voiceover ducking (lower music during speech)
  - [ ] Audio normalization
  - [ ] Fade in/out on music
  - [ ] EQ/compression for voiceover clarity

- [ ] **Color correction/filters**
  - [ ] Auto color matching between clips
  - [ ] Instagram-style filters for consistency
  - [ ] Brightness/contrast normalization
  - [ ] Color grading presets (warm, cool, cinematic)

- [ ] **Higher quality stock provider**
  - [ ] Evaluate: Storyblocks, Shutterstock, Getty
  - [ ] Multi-provider fallback
  - [ ] Quality scoring and preference

- [ ] **Thumbnail generation**
  - [ ] Extract best frame from video
  - [ ] Or generate custom thumbnail image
  - [ ] Add text overlay option

---

## 🔵 P4: Future Features

- [ ] **Human-in-the-loop options** (toggleable)
  - [ ] Script approval before production
  - [ ] Rough cut approval before final render
  - [ ] Stock footage selection approval
  - [ ] Voice sample approval

- [ ] **Multiple output formats**
  - [ ] 16:9 (YouTube, standard)
  - [ ] 9:16 (TikTok, Reels, Shorts)
  - [ ] 1:1 (Instagram feed)
  - [ ] 4:5 (Instagram portrait)
  - [ ] Multiple resolutions (720p, 1080p, 4K)

- [ ] **Template system**
  - [ ] Explainer video template
  - [ ] Product demo template
  - [ ] Testimonial template
  - [ ] Social ad template
  - [ ] Custom template builder

- [ ] **Multi-language support**
  - [ ] Script generation in multiple languages
  - [ ] ElevenLabs multilingual voices
  - [ ] Translated captions

- [ ] **Batch processing**
  - [ ] Queue multiple videos
  - [ ] Series generation (same topic, multiple angles)
  - [ ] A/B version generation

- [ ] **Usage & cost tracking**
  - [ ] Per-project cost breakdown
  - [ ] API usage dashboards
  - [ ] Budget limits/alerts
  - [ ] Cost optimization recommendations

- [ ] **Webhook notifications**
  - [ ] On completion
  - [ ] On error
  - [ ] Progress updates

---

## Completed ✅

- [x] Basic workflow pipeline
- [x] Script generation via Claude
- [x] Voiceover generation via ElevenLabs
- [x] Stock media search via Pexels
- [x] Timeline assembly
- [x] Video rendering via Shotstack
- [x] D1 database for project state
- [x] R2 storage for assets
- [x] KV caching for searches
- [x] Audio duration calculation fix
- [x] Stock media instance auth
- [x] Empty video clip handling
- [x] Defensive script parsing

---

## Notes

### AI Video vs Stock Decision Logic (Future)
When should the system use AI-generated video instead of stock?
1. **Stock search returns < 3 results** - Topic too specific
2. **Keyword match confidence < 70%** - Stock doesn't match intent
3. **Scene requires specific action** - "Person installing solar panel" vs generic solar shots
4. **Brand/product specific** - Stock won't have your product
5. **Abstract concepts** - "Energy flowing through wires" 
6. **Cost toggle OFF** - Use stock only regardless of quality

### Provider Flexibility
The worker architecture enables easy provider swaps:
- Voice: ElevenLabs → Murf.ai, Play.ht, Amazon Polly
- Stock: Pexels → Storyblocks, Shutterstock
- Render: Shotstack → Creatomate, Bannerbear
- AI Image: DALL-E → Midjourney, Stable Diffusion, Ideogram
- AI Video: Runway → Pika, Kling, Sora (when available)

### Cloudflare Workflows Benefits for New Features
- Adding AI image generation = new worker + new workflow step
- Adding music = new worker + timeline assembly update
- Provider switching = update single worker, workflow unchanged
- QC stage = insert new step between render and complete
