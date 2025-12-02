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

interface Timeline {
  script: Script;
  voiceover: Voiceover;
  media: StockMediaItem[];
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
      const response = await fetch(`${this.env.DE_API_URL}/text-gen/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Create a video script for: ${prompt}. Target duration: ${duration} seconds.
                   Return JSON with: { title, sections: [{ narration, duration, visualCues, keywords }] }`,
          options: { max_tokens: 2000 },
        }),
      });
      return response.json() as Promise<Script>;
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
    const voiceover = await step.do("generate-voiceover", async () => {
      // TODO: Call audio-gen worker
      // const response = await fetch(`${this.env.DE_API_URL}/audio-gen/synthesize`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     text: script.sections.map(s => s.narration).join(" "),
      //     voice: "default"
      //   })
      // });
      // return response.json();
      return { url: "", duration: 0 } as Voiceover;
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
      // TODO: Call stock-media worker for each section
      // const mediaPromises = script.sections.map(async (section, index) => {
      //   const response = await fetch(`${this.env.DE_API_URL}/stock-media/search`, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       keywords: section.keywords,
      //       duration: section.duration
      //     })
      //   });
      //   return response.json();
      // });
      // return Promise.all(mediaPromises);
      return [] as StockMediaItem[];
    });

    // Step 4: Assemble Timeline
    const timeline = await step.do("assemble-timeline", async () => {
      // TODO: Create timeline from voiceover + stock media
      // This would combine the voiceover timing with stock media clips
      // to create a complete timeline for rendering
      return {
        script,
        voiceover,
        media: stockMedia,
      } as Timeline;
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
    const output = await step.do("render-video", async () => {
      // TODO: Call render-service worker (Shotstack)
      // const response = await fetch(`${this.env.DE_API_URL}/render-service/render`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ timeline })
      // });
      // return response.json();
      return { url: "" } as RenderOutput;
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
