import type { Env } from './types';

/**
 * Simple authentication middleware
 * For now, this is a placeholder that can be extended with:
 * - API key validation
 * - JWT token verification
 * - Rate limiting
 */
export async function authenticate(
  request: Request,
  env: Env
): Promise<{ authenticated: boolean; error?: string }> {
  // Allow webhook endpoint without authentication (Shotstack callbacks)
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
      'SELECT instance_id FROM api_keys WHERE key = ? AND enabled = 1'
    ).bind(apiKey).first<{ instance_id: string }>();

    if (!result) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    return { authenticated: true };
  } catch (error) {
    console.error('Auth error:', error);
    return { authenticated: false, error: 'Authentication failed' };
  }
}

/**
 * Apply rate limiting using Durable Objects
 */
export async function rateLimit(
  request: Request,
  env: Env
): Promise<{ allowed: boolean; error?: string }> {
  // If rate limiter is not configured, allow all requests
  if (!env.RATE_LIMITER) {
    return { allowed: true };
  }

  try {
    // Get client identifier (IP or API key)
    const clientId =
      request.headers.get('x-api-key') ||
      request.headers.get('cf-connecting-ip') ||
      'anonymous';

    // Get rate limiter instance
    const id = env.RATE_LIMITER.idFromName(clientId);
    const limiter = env.RATE_LIMITER.get(id);

    // Check rate limit
    const response = await limiter.fetch(request);
    const result = await response.json<{ allowed: boolean }>();

    if (!result.allowed) {
      return { allowed: false, error: 'Rate limit exceeded' };
    }

    return { allowed: true };
  } catch (error) {
    // If rate limiting fails, allow the request (fail open)
    console.error('Rate limiting error:', error);
    return { allowed: true };
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
export function successResponse(data: unknown, requestId?: string): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      request_id: requestId || crypto.randomUUID(),
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
