import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";

export interface VideoParams {
  projectId: string;
  prompt: string;
  duration: number; // target duration in seconds
}

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  DE_API_URL: string;
  VIDEO_WORKFLOW: Workflow;
  ANTHROPIC_API_KEY: string;
}

interface ScriptSection {
  narration: string;
  duration: number;
  visualCues: string;
  keywords: string[];
}

interface Script {
  title: string;
  sections: ScriptSection[];
}

interface Voiceover {
  url: string;
  duration: number;
}

interface StockMediaItem {
  sectionIndex: number;
  type: string;
  url: string;
  duration: number;
}


interface RenderOutput {
  url: string;
}

export class VideoProductionWorkflow extends WorkflowEntrypoint<
  Env,
  VideoParams
> {
  async run(event: WorkflowEvent<VideoParams>, step: WorkflowStep) {
    const { projectId, prompt, duration } = event.payload;

    // Step 1: Generate Script
    const script = await step.do("generate-script", async () => {
      const sectionsNeeded = Math.ceil(duration / 10); // ~10 seconds per section
      const wordsNeeded = Math.ceil(duration * 2.5); // ~150 words per minute = 2.5 words/sec

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: `Create a video script for: "${prompt}"

REQUIREMENTS:
- Total duration: ${duration} seconds
- Create exactly ${sectionsNeeded} sections (each ~10 seconds)
- Total narration: approximately ${wordsNeeded} words
- Each section's narration should be 20-30 words (takes ~10 seconds to speak)
- Make it engaging, informative, and suitable for a professional video

Return ONLY valid JSON (no markdown, no code blocks, no explanation) with this exact structure:
{
  "title": "Video Title",
  "sections": [
    {
      "narration": "Full narration text for this section, approximately 20-30 words that takes about 10 seconds to speak aloud.",
      "duration": 10,
      "visualCues": "Description of what visuals should appear",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}

Generate all ${sectionsNeeded} sections now:`
          }]
        }),
      });

      const result = await response.json() as any;
      const content = result.content?.[0]?.text || "";

      console.log("Raw Claude response length:", content.length);

      // Parse the JSON from Claude's response
      let scriptData: Script;
      try {
        // Remove any markdown code blocks if present
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        scriptData = JSON.parse(cleanContent);
        console.log("Parsed script sections:", scriptData.sections?.length);
      } catch (e) {
        console.error("Script parse error:", e);
        scriptData = {
          title: prompt,
          sections: [{
            narration: content || prompt,
            duration: duration,
            visualCues: "General footage",
            keywords: prompt.split(' ').slice(0, 5)
          }]
        };
      }

      // Save script to DB for debugging
      await this.env.DB.prepare(
        "UPDATE projects SET script_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(JSON.stringify(scriptData), projectId).run();

      console.log("Script sections count:", scriptData.sections?.length);
      console.log("Total narration words:", scriptData.sections?.map(s => s.narration).join(' ').split(' ').length);

      return scriptData;
    });

    // Update status to script_generated
    await step.do("update-script-status", async () => {
      await this.env.DB.prepare(
        "UPDATE projects SET status = 'script_generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(projectId)
        .run();
    });

    // Step 2: Generate Voiceover
    const voiceover = await step.do("generate-voiceover", {
      retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
      timeout: "5 minutes"
    }, async () => {
      // Defensive: ensure script.sections exists
      const sections = script.sections || [{ narration: prompt }];
      console.log("Voiceover using sections:", sections.length);

      // Combine all narration text from script sections
      const fullNarration = sections
        .map((s: any) => s.narration)
        .join(" ");
      console.log("Full narration length:", fullNarration.length, "words:", fullNarration.split(' ').length);
      console.log("Full narration text:", fullNarration);

      const response = await fetch("https://audio-gen.solamp.workers.dev/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_id: "living-arts",
          project_id: projectId,
          text: fullNarration,
          options: { voice_id: "037vK30hDXR4IW8DJnGE" },
          save_to_r2: true
        })
      });

      if (!response.ok) {
        throw new Error(`Voiceover generation failed: ${response.status}`);
      }

      const result = await response.json() as any;
      return { url: result.data.url, duration: result.data.duration_seconds } as Voiceover;
    });

    // Update status to voiceover_generated
    await step.do("update-voiceover-status", async () => {
      await this.env.DB.prepare(
        "UPDATE projects SET status = 'voiceover_generated', voiceover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(voiceover.url, projectId)
        .run();
    });

    // Step 3: Gather Stock Media
    const stockMedia = await step.do("gather-stock-media", async () => {
      try {
        // Collect keywords from all sections
        const allKeywords = script.sections?.flatMap((s: any) => s.keywords || []) || [];
        const query = allKeywords.length > 0 ? allKeywords.slice(0, 3).join(' ') : prompt.split(' ').slice(0, 3).join(' ');

        console.log("Searching stock media for:", query);

        const response = await fetch("https://stock-media.solamp.workers.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_id: "living-arts",
            query: query,
            options: { per_page: 5 }
          })
        });

        const result = await response.json() as any;

        if (result.success && result.data?.videos) {
          // Map to StockMediaItem format with HD video URLs
          return result.data.videos.map((v: any) => {
            const hdFile = v.video_files?.find((f: any) => f.quality === 'hd' && f.width >= 1280)
              || v.video_files?.[0];
            return {
              id: String(v.id),
              url: hdFile?.link || v.url,
              duration: v.duration || 5,
              provider: 'pexels'
            };
          });
        }

        console.log("Stock media search failed or empty:", result);
        return [];
      } catch (error) {
        console.error("Stock media error:", error);
        return [];
      }
    });

    // Step 4: Assemble Timeline
    const timeline = await step.do("assemble-timeline", async () => {
      const sections = script.sections || [{
        narration: script.title || "Video content",
        duration: duration,
        visualCues: "General footage",
        keywords: []
      }];

      console.log("Assembling timeline with sections:", sections.length, "stock clips:", stockMedia.length);

      // Build video clips from stock media
      const videoClips = [];
      let currentTime = 0;

      for (let index = 0; index < sections.length; index++) {
        const section = sections[index];
        // Use stock clips in order, cycling if we have fewer clips than sections
        const stockClip = stockMedia.length > 0 ? stockMedia[index % stockMedia.length] : null;

        if (stockClip?.url) {
          videoClips.push({
            id: `clip-${index}`,
            type: "stock",
            src: stockClip.url,
            start: currentTime,
            duration: section.duration || 10,
            transition: { type: "fade", duration: 0.5 }
          });
        }
        currentTime += section.duration || 10;
      }

      console.log("Built video clips:", videoClips.length);

      // Create timeline
      const timelineData = {
        projectId,
        duration: duration,  // Use target duration, not voiceover.duration
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        tracks: {
          video: videoClips.length > 0 ? [{ id: "main-video", clips: videoClips }] : [],
          audio: [{
            id: "voiceover-track",
            clips: [{
              id: "main-voiceover",
              type: "voiceover",
              src: voiceover.url,
              start: 0,
              duration: voiceover.duration || duration,
              volume: 1
            }]
          }],
          overlay: []
        }
      };

      // Save timeline to DB
      await this.env.DB.prepare(
        "UPDATE projects SET timeline_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(JSON.stringify(timelineData), projectId).run();

      return timelineData;
    });

    // Update status to timeline_assembled
    await step.do("update-timeline-status", async () => {
      const timelineUrl = `projects/${projectId}/timeline.json`;
      await this.env.STORAGE.put(
        timelineUrl,
        JSON.stringify(timeline, null, 2)
      );
      await this.env.DB.prepare(
        "UPDATE projects SET status = 'timeline_assembled', timeline_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(timelineUrl, projectId)
        .run();
    });

    // Step 5: Render Video
    const output = await step.do("render-video", {
      retries: { limit: 2, delay: "30 seconds" },
      timeout: "10 minutes"
    }, async () => {
      // Submit render job
      const renderResponse = await fetch("https://render-service.solamp.workers.dev/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_id: "living-arts",
          project_id: projectId,
          timeline: timeline,
          options: {
            format: "mp4",
            resolution: "hd",
            webhook_url: "https://living-arts.solamp.workers.dev/api/webhooks/render"
          }
        })
      });

      if (!renderResponse.ok) {
        throw new Error(`Render submission failed: ${renderResponse.status}`);
      }

      const renderResult = await renderResponse.json() as any;
      const renderId = renderResult.data.render_id;

      // Poll for completion (Shotstack typically takes 30-60 seconds)
      let attempts = 0;
      while (attempts < 20) {
        await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds

        const statusResponse = await fetch(
          `https://render-service.solamp.workers.dev/status/${renderId}`
        );

        if (!statusResponse.ok) {
          attempts++;
          continue;
        }

        const status = await statusResponse.json() as any;

        if (status.data.status === "done") {
          return { url: status.data.url } as RenderOutput;
        }

        if (status.data.status === "failed") {
          throw new Error(`Render failed: ${status.data.error}`);
        }

        attempts++;
      }

      throw new Error("Render timeout - check status manually");
    });

    // Step 6: Update Project Status
    await step.do("update-status", async () => {
      await this.env.DB.prepare(
        "UPDATE projects SET status = 'complete', output_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(output.url, projectId)
        .run();
    });

    return { projectId, outputUrl: output.url };
  }
}
