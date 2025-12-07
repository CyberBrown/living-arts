import type { Env } from './index';

/**
 * Authentication middleware for video-workflow worker
 * Validates API keys against D1 database
 */
export async function authenticate(
  request: Request,
  env: Env
): Promise<{ authenticated: boolean; error?: string }> {
  // Allow webhook endpoint without authentication
  const url = new URL(request.url);
  if (url.pathname === '/webhook') {
    return { authenticated: true };
  }

  // Allow health check without authentication
  if (url.pathname === '/health') {
    return { authenticated: true };
  }

  // Validate API key from header
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return { authenticated: false, error: 'Missing API key' };
  }

  // Validate API key against database
  try {
    const result = await env.DB.prepare(
      'SELECT instance_id, last_used_at FROM api_keys WHERE key = ? AND enabled = 1'
    ).bind(apiKey).first<{ instance_id: string; last_used_at: string | null }>();

    if (!result) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    // Update last_used_at timestamp asynchronously
    env.DB.prepare(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key = ?'
    ).bind(apiKey).run().catch(err => {
      console.error('Failed to update last_used_at:', err);
    });

    return { authenticated: true };
  } catch (error) {
    console.error('Auth error:', error);
    return { authenticated: false, error: 'Authentication failed' };
  }
}

/**
 * Create a JSON error response
 */
export function errorResponse(
  message: string,
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
      },
    }
  );
}

/**
 * Create a JSON success response
 */
export function successResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
      },
    }
  );
}
