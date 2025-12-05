import type { Env } from './types';

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
