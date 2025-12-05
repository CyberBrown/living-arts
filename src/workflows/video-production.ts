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
  TEXT_GEN_URL: string;
  AUDIO_GEN_URL: string;
  STOCK_MEDIA_URL: string;
  RENDER_SERVICE_URL: string;
  VIDEO_WORKFLOW: Workflow;
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

interface MediaItem {
  id: string;
  type: "video" | "image";
  url: string;
  preview_url: string;
  duration?: number;
  width: number;
  height: number;
}

interface SectionMedia {
  sectionIndex: number;
  media: MediaItem[];
}

interface TimelineClip {
  asset: {
    type: "video" | "image" | "audio" | "title";
    src?: string;
    text?: string;
    style?: string;
    color?: string;
    size?: string;
    background?: string;
    position?: string;
  };
  start: number;
  length: number;
  fit?: "crop" | "cover" | "contain";
}

interface ShotstackTimeline {
  soundtrack?: {
    src: string;
    effect?: string;
    volume?: number;
  };
  tracks: Array<{ clips: TimelineClip[] }>;
}

interface RenderOutput {
  url: string;
  render_id: string;
}

export class VideoProductionWorkflow extends WorkflowEntrypoint<
  Env,
  VideoParams
> {
  async run(event: WorkflowEvent<VideoParams>, step: WorkflowStep) {
    const { projectId, prompt, duration } = event.payload;

    try {
      // Step 1: Generate Script
      const script = await step.do("generate-script", async () => {
        const response = await fetch(
          `${this.env.TEXT_GEN_URL}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `You are a professional video scriptwriter. Create an educational video script.

Topic: ${prompt}
Target Duration: ${duration} seconds

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "Video Title",
  "sections": [
    {
      "narration": "The text to be spoken for this section",
      "duration": 30,
      "visualCues": "Description of what should be shown visually",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}

Requirements:
- Total duration of all sections should equal approximately ${duration} seconds
- Each section should be 15-45 seconds
- Keywords should be specific and visual (good for stock footage search)
- Narration should be clear and educational`,
              model: "anthropic:claude-sonnet-4-20250514",
              options: { max_tokens: 2000, temperature: 0.7 },
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Script generation failed: ${error}`);
        }

        const result = (await response.json()) as { success: boolean; text: string };

        // Parse the JSON from the text response
        try {
          return JSON.parse(result.text) as Script;
        } catch {
          throw new Error("Failed to parse script JSON from AI response");
        }
      });

      // Update status to script_generated
      await step.do("update-script-status", async () => {
        const scriptUrl = `projects/${projectId}/script.json`;
        await this.env.STORAGE.put(scriptUrl, JSON.stringify(script, null, 2));
        await this.env.DB.prepare(
          "UPDATE projects SET status = 'script_generated', script_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
          .bind(scriptUrl, projectId)
          .run();
      });

      // Step 2: Generate Voiceover
      const voiceover = await step.do("generate-voiceover", async () => {
        // Combine all narration text
        const fullNarration = script.sections
          .map((s) => s.narration)
          .join("\n\n");

        const response = await fetch(
          `${this.env.AUDIO_GEN_URL}/synthesize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: fullNarration,
              options: {
                model_id: "eleven_multilingual_v2",
                stability: 0.75,
                similarity_boost: 0.85,
                style: 0.5,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Voiceover generation failed: ${error}`);
        }

        const result = (await response.json()) as {
          success: boolean;
          audio_url: string;
          duration_seconds: number;
        };

        return {
          url: result.audio_url,
          duration: result.duration_seconds,
        } as Voiceover;
      });

      // Update status to voiceover_generated
      await step.do("update-voiceover-status", async () => {
        await this.env.DB.prepare(
          "UPDATE projects SET status = 'voiceover_generated', voiceover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
          .bind(voiceover.url, projectId)
          .run();
      });

      // Step 3: Gather Stock Media for each section
      const sectionMedia = await step.do("gather-stock-media", async () => {
        const mediaResults: SectionMedia[] = [];

        for (let i = 0; i < script.sections.length; i++) {
          const section = script.sections[i];

          const response = await fetch(
            `${this.env.STOCK_MEDIA_URL}/search/videos`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                keywords: section.keywords,
                orientation: "landscape",
                options: {
                  per_page: 5,
                  min_duration: Math.max(5, section.duration - 10),
                  max_duration: section.duration + 30,
                },
              }),
            }
          );

          if (!response.ok) {
            console.error(
              `Stock media search failed for section ${i}:`,
              await response.text()
            );
            // Continue with empty media for this section
            mediaResults.push({ sectionIndex: i, media: [] });
            continue;
          }

          const result = (await response.json()) as {
            success: boolean;
            media: MediaItem[];
          };

          mediaResults.push({
            sectionIndex: i,
            media: result.media || [],
          });
        }

        return mediaResults;
      });

      // Step 4: Assemble Timeline
      const timeline = await step.do("assemble-timeline", async () => {
        const videoClips: TimelineClip[] = [];
        const textOverlays: TimelineClip[] = [];
        let currentTime = 0;
        const totalDuration = script.sections.reduce((sum, s) => sum + s.duration, 0);

        // Add title card at the beginning (3 seconds)
        const titleDuration = 3;
        textOverlays.push({
          asset: {
            type: "title",
            text: script.title,
            style: "future",
            color: "#ffffff",
            size: "large",
            background: "#000000",
            position: "center",
          },
          start: 0,
          length: titleDuration,
        });

        // Build video track from stock media
        for (let i = 0; i < script.sections.length; i++) {
          const section = script.sections[i];
          const media = sectionMedia.find((m) => m.sectionIndex === i);

          if (media && media.media.length > 0) {
            // Use first matching video/image for this section
            const item = media.media[0];
            videoClips.push({
              asset: {
                type: item.type,
                src: item.url,
              },
              start: currentTime,
              length: section.duration,
              fit: "cover",
            });
          }

          // Add section header/lower third (2 seconds at start of each section after first)
          if (i > 0 && section.visualCues) {
            textOverlays.push({
              asset: {
                type: "title",
                text: `Section ${i + 1}`,
                style: "minimal",
                color: "#ffffff",
                size: "small",
                position: "bottomLeft",
              },
              start: currentTime,
              length: 2,
            });
          }

          currentTime += section.duration;
        }

        // Add end card / call-to-action (3 seconds)
        const endCardDuration = 3;
        textOverlays.push({
          asset: {
            type: "title",
            text: "Thanks for watching!",
            style: "future",
            color: "#ffffff",
            size: "medium",
            background: "#000000",
            position: "center",
          },
          start: totalDuration - endCardDuration,
          length: endCardDuration,
        });

        const shotstackTimeline: ShotstackTimeline = {
          soundtrack: {
            src: voiceover.url,
            effect: "fadeOut",
            volume: 1,
          },
          tracks: [
            { clips: textOverlays }, // Text overlays on top
            { clips: videoClips },   // Video clips below
          ],
        };

        return shotstackTimeline;
      });

      // Update status to timeline_assembled
      await step.do("update-timeline-status", async () => {
        const timelineUrl = `projects/${projectId}/timeline.json`;
        await this.env.STORAGE.put(timelineUrl, JSON.stringify(timeline, null, 2));
        await this.env.DB.prepare(
          "UPDATE projects SET status = 'timeline_assembled', timeline_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
          .bind(timelineUrl, projectId)
          .run();
      });

      // Step 5: Submit Render Job
      const renderJob = await step.do("submit-render", async () => {
        const response = await fetch(
          `${this.env.RENDER_SERVICE_URL}/render`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeline,
              output: {
                format: "mp4",
                resolution: "hd",
                fps: 25,
              },
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Render submission failed: ${error}`);
        }

        const result = (await response.json()) as {
          success: boolean;
          render_id: string;
        };

        return { render_id: result.render_id };
      });

      // Step 6: Poll for render completion
      const output = await step.do("wait-for-render", async () => {
        const maxAttempts = 60; // 10 minutes with 10s intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
          const response = await fetch(
            `${this.env.RENDER_SERVICE_URL}/render/${renderJob.render_id}`,
            { method: "GET" }
          );

          if (!response.ok) {
            throw new Error(`Render status check failed: ${response.status}`);
          }

          const status = (await response.json()) as {
            status: string;
            url?: string;
            error?: string;
          };

          if (status.status === "done" && status.url) {
            return { url: status.url, render_id: renderJob.render_id };
          }

          if (status.status === "failed") {
            throw new Error(`Render failed: ${status.error || "Unknown error"}`);
          }

          // Wait 10 seconds before next check
          await new Promise((resolve) => setTimeout(resolve, 10000));
          attempts++;
        }

        throw new Error("Render timed out after 10 minutes");
      });

      // Step 7: Update Project Status to complete
      await step.do("update-complete-status", async () => {
        await this.env.DB.prepare(
          "UPDATE projects SET status = 'complete', output_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
          .bind(output.url, projectId)
          .run();
      });

      return { projectId, outputUrl: output.url };
    } catch (error) {
      // Handle errors - update project status to failed
      await step.do("handle-error", async () => {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await this.env.DB.prepare(
          "UPDATE projects SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
          .bind(projectId)
          .run();
        console.error(`Workflow failed for project ${projectId}:`, errorMessage);
      });

      throw error;
    }
  }
}
