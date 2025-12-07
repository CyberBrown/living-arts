import type { Env } from './types';

/**
 * Authentication middleware for stock-media worker
 * Validates API keys against D1 database
 */
export async function authenticate(
  request: Request,
  env: Env
): Promise<{ authenticated: boolean; error?: string }> {
  // Allow health check without authentication
  const url = new URL(request.url);
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

export async function validateInstanceId(
  instanceId: string,
  env: Env
): Promise<boolean> {
  if (!instanceId || instanceId.trim() === '') {
    return false;
  }

  try {
    const result = await env.DB.prepare(
      'SELECT id FROM instances WHERE id = ? AND status = ?'
    )
      .bind(instanceId, 'active')
      .first();

    return result !== null;
  } catch (error) {
    console.error('Error validating instance:', error);
    return false;
  }
}

export async function validateProjectAccess(
  instanceId: string,
  projectId: string,
  env: Env
): Promise<boolean> {
  if (!projectId || projectId.trim() === '') {
    return false;
  }

  try {
    const result = await env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND instance_id = ?'
    )
      .bind(projectId, instanceId)
      .first();

    return result !== null;
  } catch (error) {
    console.error('Error validating project access:', error);
    return false;
  }
}
