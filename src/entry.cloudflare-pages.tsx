/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Cloudflare Workers with Assets when building for production.
 *
 */
import {
  createQwikCity,
  type PlatformCloudflarePages,
} from "@builder.io/qwik-city/middleware/cloudflare-pages";
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import render from "./entry.ssr";

// Export the workflow class for Cloudflare Workers
export { VideoProductionWorkflow } from "./workflows/video-production";

declare global {
  interface QwikCityPlatform extends PlatformCloudflarePages {}
}

const fetch = createQwikCity({ render, qwikCityPlan, manifest });

// Export as default for Workers format
export default { fetch };

// Also export fetch for backwards compatibility
export { fetch };
