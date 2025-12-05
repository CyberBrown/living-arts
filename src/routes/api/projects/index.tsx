import type { RequestHandler } from "@builder.io/qwik-city";
import type { Env } from "../../../workflows/video-production";

export const onGet: RequestHandler = async ({ platform, json }) => {
  const env = platform.env as Env;

  if (!env.DB) {
    json(200, []);
    return;
  }

  try {
    const result = await env.DB.prepare(
      "SELECT id, prompt, status, duration, output_url, created_at FROM projects ORDER BY created_at DESC LIMIT 20"
    ).all();

    json(200, result.results || []);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    json(500, { error: "Failed to fetch projects" });
  }
};
