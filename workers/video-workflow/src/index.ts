/**
 * Video Workflow Worker
 * HTTP wrapper for the VideoProductionWorkflow
 */

import type { VideoParams } from "./video-production";
import { authenticate, errorResponse } from "./auth";

export { VideoProductionWorkflow } from "./video-production";

export interface Env {
  VIDEO_WORKFLOW: Workflow;
  DB: D1Database;
  STORAGE: R2Bucket;
  DE_API_URL: string;
}

interface StartRequest {
  projectId: string;
  prompt: string;
  duration: number;
}

interface StartResponse {
  success: boolean;
  workflowId: string;
  status: string;
  projectId: string;
}

interface StatusResponse {
  success: boolean;
  projectId: string;
  status: string;
  workflowId?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    try {
      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key",
            "Access-Control-Max-Age": "86400",
          },
        });
      }

      // Authenticate request
      const authResult = await authenticate(request, env);
      if (!authResult.authenticated) {
        return errorResponse(authResult.error || 'Unauthorized', 401);
      }

      // Health check
      if (url.pathname === "/health" && request.method === "GET") {
        return addCorsHeaders(
          Response.json({
            status: "healthy",
            service: "video-workflow",
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Start workflow
      if (url.pathname === "/start" && request.method === "POST") {
        return addCorsHeaders(await handleStart(request, env, requestId));
      }

      // Get workflow status
      if (url.pathname.startsWith("/status/") && request.method === "GET") {
        const projectId = url.pathname.split("/")[2];
        return addCorsHeaders(await handleStatus(projectId, env, requestId));
      }

      // Webhook endpoint
      if (url.pathname === "/webhook" && request.method === "POST") {
        return addCorsHeaders(await handleWebhook(request, env, requestId));
      }

      return addCorsHeaders(
        Response.json(
          { error: "Not Found", code: "ROUTE_NOT_FOUND" },
          { status: 404 }
        )
      );
    } catch (error) {
      console.error("Unhandled error:", error);
      return addCorsHeaders(
        Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Internal Server Error",
            code: "INTERNAL_ERROR",
            request_id: requestId,
          },
          { status: 500 }
        )
      );
    }
  },
};

/**
 * Start a new video production workflow
 */
async function handleStart(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  try {
    const body: StartRequest = await request.json();

    // Validate request
    if (!body.projectId || !body.prompt || !body.duration) {
      return Response.json(
        {
          error: "Missing required fields: projectId, prompt, duration",
          code: "INVALID_REQUEST",
        },
        { status: 400 }
      );
    }

    // Create workflow instance
    const params: VideoParams = {
      projectId: body.projectId,
      prompt: body.prompt,
      duration: body.duration,
    };

    const instance = await env.VIDEO_WORKFLOW.create({ params });

    // Update project status in DB
    await env.DB.prepare(
      "UPDATE projects SET status = 'workflow_started', workflow_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(instance.id, body.projectId)
      .run();

    const response: StartResponse = {
      success: true,
      workflowId: instance.id,
      status: "started",
      projectId: body.projectId,
    };

    console.log("Workflow started:", {
      workflowId: instance.id,
      projectId: body.projectId,
      requestId,
    });

    return Response.json(response);
  } catch (error) {
    console.error("Start workflow error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start workflow",
        code: "START_ERROR",
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * Get workflow status for a project
 */
async function handleStatus(
  projectId: string,
  env: Env,
  requestId: string
): Promise<Response> {
  try {
    // Query project status from DB
    const result = await env.DB.prepare(
      "SELECT status, workflow_id, output_url, voiceover_url, timeline_url FROM projects WHERE id = ?"
    )
      .bind(projectId)
      .first();

    if (!result) {
      return Response.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const response: StatusResponse = {
      success: true,
      projectId,
      status: result.status as string,
      workflowId: result.workflow_id as string | undefined,
    };

    return Response.json(response);
  } catch (error) {
    console.error("Status query error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get status",
        code: "STATUS_ERROR",
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle webhook callbacks (e.g., from render service)
 */
async function handleWebhook(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  try {
    const body = await request.json();
    console.log("Webhook received:", { body, requestId });

    // Handle different webhook types
    if (body.type === "render_complete") {
      // Update project with render URL
      await env.DB.prepare(
        "UPDATE projects SET output_url = ?, status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(body.url, body.projectId)
        .run();
    }

    return Response.json({ success: true, received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Webhook failed",
        code: "WEBHOOK_ERROR",
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  return newResponse;
}
