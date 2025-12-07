import { ShotstackProvider } from './providers/shotstack';
import { TimelineConverter } from './timeline/converter';
import {
  authenticate,
  rateLimit,
  errorResponse,
  successResponse,
} from './auth';
import type {
  Env,
  RenderRequest,
  RenderJob,
  ShotstackWebhook,
} from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        },
      });
    }

    // Authenticate request
    const authResult = await authenticate(request, env);
    if (!authResult.authenticated) {
      return errorResponse(authResult.error || 'Unauthorized', 401);
    }

    // Apply rate limiting
    const rateLimitResult = await rateLimit(request, env);
    if (!rateLimitResult.allowed) {
      return errorResponse(rateLimitResult.error || 'Rate limit exceeded', 429);
    }

    // Route requests
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return handleHealth(env);
      }

      if (url.pathname === '/render' && request.method === 'POST') {
        return handleRender(request, env);
      }

      if (url.pathname.startsWith('/status/') && request.method === 'GET') {
        const renderId = url.pathname.split('/')[2];
        return handleStatus(renderId, env);
      }

      if (url.pathname === '/webhook' && request.method === 'POST') {
        return handleWebhook(request, env);
      }

      return errorResponse('Not found', 404);
    } catch (error) {
      console.error('Worker error:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        500
      );
    }
  },
};

/**
 * Health check endpoint
 */
async function handleHealth(env: Env): Promise<Response> {
  return successResponse({
    status: 'healthy',
    service: 'render-service',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Submit a video for rendering
 */
async function handleRender(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<RenderRequest>();

    // Validate request
    if (!body.timeline || !body.instance_id || !body.project_id) {
      return errorResponse('Missing required fields: timeline, instance_id, project_id');
    }

    // Convert timeline to Shotstack format
    const converter = new TimelineConverter();
    const shotstackEdit = converter.convert(body.timeline, body.options);

    // Use production key if ENVIRONMENT=production, otherwise use sandbox
    const apiKey = env.ENVIRONMENT === 'production' && env.SHOTSTACK_API_KEY
      ? env.SHOTSTACK_API_KEY
      : env.SHOTSTACK_API_KEY_SANDBOX;

    // Submit to Shotstack
    const shotstack = new ShotstackProvider(
      apiKey,
      env.SHOTSTACK_ENV
    );
    const renderResponse = await shotstack.render(shotstackEdit);

    if (!renderResponse.success) {
      return errorResponse('Failed to submit render job', 500);
    }

    const renderId = renderResponse.response.id;

    // Store job metadata in KV
    const job: RenderJob = {
      project_id: body.project_id,
      instance_id: body.instance_id,
      status: 'queued',
      created_at: new Date().toISOString(),
      webhook_url: body.options?.webhook_url,
      shotstack_id: renderId,
    };

    await env.RENDER_JOBS.put(`render:${renderId}`, JSON.stringify(job), {
      expirationTtl: 86400 * 7, // 7 days
    });

    return successResponse({
      render_id: renderId,
      status: 'queued',
      estimated_time: 30,
      webhook_configured: !!body.options?.webhook_url,
    });
  } catch (error) {
    console.error('Render error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to process render request',
      500
    );
  }
}

/**
 * Check render status
 */
async function handleStatus(renderId: string, env: Env): Promise<Response> {
  try {
    if (!renderId) {
      return errorResponse('Missing render ID');
    }

    // Get job from KV
    const jobData = await env.RENDER_JOBS.get(`render:${renderId}`);
    if (!jobData) {
      return errorResponse('Render job not found', 404);
    }

    // Use production key if ENVIRONMENT=production, otherwise use sandbox
    const apiKey = env.ENVIRONMENT === 'production' && env.SHOTSTACK_API_KEY
      ? env.SHOTSTACK_API_KEY
      : env.SHOTSTACK_API_KEY_SANDBOX;

    // Get status from Shotstack
    const shotstack = new ShotstackProvider(
      apiKey,
      env.SHOTSTACK_ENV
    );
    const statusResponse = await shotstack.getStatus(renderId);

    if (!statusResponse.success) {
      return errorResponse('Failed to get render status', 500);
    }

    const status = statusResponse.response;

    // Update job in KV
    const job: RenderJob = JSON.parse(jobData);
    job.status = status.status;
    await env.RENDER_JOBS.put(`render:${renderId}`, JSON.stringify(job), {
      expirationTtl: 86400 * 7, // 7 days
    });

    return successResponse({
      render_id: renderId,
      status: status.status,
      progress: calculateProgress(status.status),
      url: status.url,
      error: status.error,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to check render status',
      500
    );
  }
}

/**
 * Handle Shotstack webhook callbacks
 */
async function handleWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const webhook = await request.json<ShotstackWebhook>();

    console.log('Received webhook:', webhook);

    // Get job from KV
    const jobData = await env.RENDER_JOBS.get(`render:${webhook.id}`);
    if (!jobData) {
      console.warn('Webhook for unknown job:', webhook.id);
      return successResponse({ received: true });
    }

    const job: RenderJob = JSON.parse(jobData);

    // Update job status
    job.status = webhook.status;
    await env.RENDER_JOBS.put(`render:${webhook.id}`, JSON.stringify(job), {
      expirationTtl: 86400 * 7, // 7 days
    });

    // If render is complete, download and store in R2
    if (webhook.status === 'done' && webhook.url) {
      try {
        // Use production key if ENVIRONMENT=production, otherwise use sandbox
        const apiKey = env.ENVIRONMENT === 'production' && env.SHOTSTACK_API_KEY
          ? env.SHOTSTACK_API_KEY
          : env.SHOTSTACK_API_KEY_SANDBOX;

        const shotstack = new ShotstackProvider(
          apiKey,
          env.SHOTSTACK_ENV
        );
        const videoData = await shotstack.downloadVideo(webhook.url);

        // Upload to R2
        const r2Key = `renders/${job.project_id}/${webhook.id}.mp4`;
        await env.R2_BUCKET.put(r2Key, videoData, {
          httpMetadata: {
            contentType: 'video/mp4',
          },
        });

        console.log('Video uploaded to R2:', r2Key);

        // Forward webhook to Living Arts if configured
        if (job.webhook_url) {
          await fetch(job.webhook_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              render_id: webhook.id,
              project_id: job.project_id,
              instance_id: job.instance_id,
              status: 'completed',
              r2_key: r2Key,
              shotstack_url: webhook.url,
            }),
          });
        }
      } catch (error) {
        console.error('Failed to process completed render:', error);
      }
    }

    // If render failed, forward error
    if (webhook.status === 'failed' && job.webhook_url) {
      await fetch(job.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          render_id: webhook.id,
          project_id: job.project_id,
          instance_id: job.instance_id,
          status: 'failed',
          error: webhook.error,
        }),
      });
    }

    return successResponse({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Return success anyway to avoid Shotstack retrying
    return successResponse({ received: true, error: String(error) });
  }
}

/**
 * Calculate progress percentage from status
 */
function calculateProgress(
  status: string
): number | undefined {
  const progressMap: Record<string, number> = {
    queued: 10,
    fetching: 25,
    rendering: 50,
    saving: 75,
    done: 100,
    failed: 0,
  };
  return progressMap[status];
}
