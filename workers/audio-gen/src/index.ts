/**
 * Audio Generation Worker
 * Main worker that orchestrates audio generation workflow using ElevenLabs
 */

import { generateSpeech, listVoices, getAudioContentType } from './providers/elevenlabs';
import { authenticate, errorResponse as authErrorResponse } from './auth';
import type {
  Env,
  GenerateRequest,
  GenerateResponse,
  VoicesResponse,
  ErrorResponse,
  InstanceConfig,
  AudioResult,
  Voice,
} from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Generate request ID for tracking
    const requestId = crypto.randomUUID();

    try {
      const url = new URL(request.url);

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization, x-api-key',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Authenticate request
      const authResult = await authenticate(request, env);
      if (!authResult.authenticated) {
        return addCorsHeaders(authErrorResponse(authResult.error || 'Unauthorized', 401));
      }

      // Route handling
      if (url.pathname === '/generate' && request.method === 'POST') {
        const response = await handleGenerate(request, env, requestId);
        return addCorsHeaders(response);
      }

      if (url.pathname === '/voices' && request.method === 'GET') {
        const response = await handleVoices(request, env, requestId);
        return addCorsHeaders(response);
      }

      if (url.pathname === '/health' && request.method === 'GET') {
        return addCorsHeaders(Response.json({
          status: 'healthy',
          service: 'audio-gen',
          r2_configured: !!env.R2_BUCKET,
          timestamp: new Date().toISOString(),
        }));
      }

      // Serve audio files from R2
      if (url.pathname.startsWith('/audio/') && request.method === 'GET') {
        const response = await handleAudioServe(url.pathname.replace('/audio/', ''), env);
        return addCorsHeaders(response);
      }

      return addCorsHeaders(createErrorResponse(
        'Not Found',
        'ROUTE_NOT_FOUND',
        requestId,
        404
      ));
    } catch (error) {
      console.error('Unhandled error:', error);
      return addCorsHeaders(createErrorResponse(
        error instanceof Error ? error.message : 'Internal Server Error',
        'INTERNAL_ERROR',
        requestId,
        500
      ));
    }
  },
};

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization, x-api-key');
  return newResponse;
}

/**
 * Handle audio generation request
 */
async function handleGenerate(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const startTime = Date.now();

  try {
    // Parse request body
    const body: GenerateRequest = await request.json();

    // Validate request
    if (!body.text || body.text.trim() === '') {
      return createErrorResponse(
        'Text is required',
        'INVALID_REQUEST',
        requestId,
        400
      );
    }

    if (!body.instance_id || body.instance_id.trim() === '') {
      return createErrorResponse(
        'instance_id is required',
        'INVALID_REQUEST',
        requestId,
        400
      );
    }

    // Get instance configuration
    const instanceConfig = await getInstanceConfig(body.instance_id, env);

    if (!instanceConfig) {
      return createErrorResponse(
        `Instance not found: ${body.instance_id}`,
        'INSTANCE_NOT_FOUND',
        requestId,
        404
      );
    }

    // Get API key
    // Use production key if ENVIRONMENT=production, otherwise use sandbox
    const defaultKey = env.ENVIRONMENT === 'production' && env.ELEVENLABS_API_KEY
      ? env.ELEVENLABS_API_KEY
      : env.ELEVENLABS_API_KEY_SANDBOX;
    const apiKey = instanceConfig.api_keys['elevenlabs'] || defaultKey;
    if (!apiKey) {
      return createErrorResponse(
        'ElevenLabs API key not configured',
        'MISSING_API_KEY',
        requestId,
        500
      );
    }

    // Merge options with defaults
    const options = {
      voice_id: body.options?.voice_id || env.DEFAULT_VOICE_ID,
      model_id: body.options?.model_id || env.DEFAULT_MODEL_ID,
      stability: body.options?.stability ?? 0.5,
      similarity_boost: body.options?.similarity_boost ?? 0.75,
      output_format: body.options?.output_format || 'mp3_44100_128',
    };

    // Generate audio using ElevenLabs
    const audioResult: AudioResult = await generateSpeech(
      body.text,
      options,
      apiKey
    );

    // Calculate generation time
    const generationTime = Date.now() - startTime;

    let audioUrl = '';
    let r2Path = '';

    // Upload to R2 if requested (default: true)
    if (body.save_to_r2 !== false) {
      const uploadResult = await uploadAudioToR2(
        audioResult,
        body.instance_id,
        body.project_id,
        env,
        request.url
      );
      audioUrl = uploadResult.cdn_url;
      r2Path = uploadResult.r2_path;
    } else {
      // If not saving to R2, we'd need to return the audio data directly
      // For this implementation, we'll require R2 storage
      return createErrorResponse(
        'R2 storage is required for audio generation',
        'R2_REQUIRED',
        requestId,
        400
      );
    }

    // Return success response
    const response: GenerateResponse = {
      success: true,
      data: {
        url: audioUrl,
        r2_path: r2Path,
        duration_seconds: audioResult.duration_seconds,
        character_count: audioResult.character_count,
        metadata: {
          voice_id: audioResult.voice_id,
          model_id: audioResult.model_id,
          provider: audioResult.provider,
        },
      },
      request_id: requestId,
      timestamp: new Date().toISOString(),
    };

    console.log(`Audio generated successfully in ${generationTime}ms:`, {
      request_id: requestId,
      instance_id: body.instance_id,
      character_count: audioResult.character_count,
      duration: audioResult.duration_seconds,
    });

    return Response.json(response, {
      headers: {
        'X-Request-ID': requestId,
      },
    });
  } catch (error) {
    console.error('Generation error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Invalid ElevenLabs API key')) {
        return createErrorResponse(
          'Invalid API key',
          'INVALID_API_KEY',
          requestId,
          401
        );
      }

      if (error.message.includes('rate limit')) {
        return createErrorResponse(
          'ElevenLabs rate limit exceeded',
          'PROVIDER_RATE_LIMIT',
          requestId,
          429
        );
      }

      if (error.message.includes('Invalid request parameters')) {
        return createErrorResponse(
          error.message,
          'INVALID_PARAMETERS',
          requestId,
          422
        );
      }

      if (error.message.includes('temporarily unavailable')) {
        return createErrorResponse(
          'ElevenLabs service temporarily unavailable',
          'SERVICE_UNAVAILABLE',
          requestId,
          503
        );
      }
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Generation failed',
      'GENERATION_ERROR',
      requestId,
      500
    );
  }
}

/**
 * Handle voices list request
 */
async function handleVoices(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  try {
    // Get API key
    // Use production key if ENVIRONMENT=production, otherwise use sandbox
    const apiKey = env.ENVIRONMENT === 'production' && env.ELEVENLABS_API_KEY
      ? env.ELEVENLABS_API_KEY
      : env.ELEVENLABS_API_KEY_SANDBOX;
    if (!apiKey) {
      return createErrorResponse(
        'ElevenLabs API key not configured',
        'MISSING_API_KEY',
        requestId,
        500
      );
    }

    // Fetch voices from ElevenLabs
    const voices = await listVoices(apiKey);

    // Transform to our format
    const transformedVoices: Voice[] = voices.map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category as 'premade' | 'cloned',
      labels: v.labels,
    }));

    const response: VoicesResponse = {
      success: true,
      data: {
        voices: transformedVoices,
      },
    };

    return Response.json(response, {
      headers: {
        'X-Request-ID': requestId,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Voices list error:', error);

    if (error instanceof Error && error.message.includes('Invalid ElevenLabs API key')) {
      return createErrorResponse(
        'Invalid API key',
        'INVALID_API_KEY',
        requestId,
        401
      );
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch voices',
      'VOICES_ERROR',
      requestId,
      500
    );
  }
}

/**
 * Upload audio to R2 storage
 */
async function uploadAudioToR2(
  audioResult: AudioResult,
  instanceId: string,
  projectId: string | undefined,
  env: Env,
  requestUrl: string
): Promise<{ cdn_url: string; r2_path: string }> {
  if (!env.R2_BUCKET) {
    throw new Error('R2_BUCKET binding not configured');
  }

  // Generate unique path: {instance_id}/{project_id}/audio/{timestamp}.mp3
  const timestamp = Date.now();
  const hash = await generateHash(audioResult.audio_data);
  const filename = `${timestamp}_${hash}.mp3`;

  const pathParts = [instanceId];
  if (projectId) {
    pathParts.push(projectId);
  }
  pathParts.push('audio', filename);
  const r2Path = pathParts.join('/');

  // Prepare metadata
  const metadata = {
    voice_id: audioResult.voice_id,
    model_id: audioResult.model_id,
    provider: audioResult.provider,
    duration_seconds: String(audioResult.duration_seconds),
    character_count: String(audioResult.character_count),
    generated_at: new Date().toISOString(),
  };

  // Upload to R2
  await env.R2_BUCKET.put(r2Path, audioResult.audio_data, {
    httpMetadata: {
      contentType: getAudioContentType(audioResult.metadata?.output_format),
    },
    customMetadata: metadata,
  });

  // Generate CDN URL
  const baseUrl = requestUrl.match(/^https?:\/\/[^\/]+/)?.[0] || '';
  const cdnUrl = `${baseUrl}/audio/${r2Path}`;

  return {
    cdn_url: cdnUrl,
    r2_path: r2Path,
  };
}

/**
 * Serve audio file from R2
 */
async function handleAudioServe(path: string, env: Env): Promise<Response> {
  if (!env.R2_BUCKET) {
    return new Response('R2 bucket not configured', { status: 500 });
  }

  console.log('Audio serve - requested path:', path);
  const object = await env.R2_BUCKET.get(path);
  console.log('Audio serve - R2 object found:', !!object);

  if (!object) {
    return new Response(JSON.stringify({
      error: 'Audio not found',
      requested_path: path,
      message: 'File not found in R2 bucket'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, {
    headers,
  });
}

/**
 * Get instance configuration
 * Mock implementation for MVP - in production, this would query the Config Service
 */
async function getInstanceConfig(
  instanceId: string,
  env: Env
): Promise<InstanceConfig | null> {
  // Mock configuration for MVP
  // In production, this would query the Config Service or D1 database
  // Use production key if ENVIRONMENT=production, otherwise use sandbox
  const defaultKey = env.ENVIRONMENT === 'production' && env.ELEVENLABS_API_KEY
    ? env.ELEVENLABS_API_KEY
    : env.ELEVENLABS_API_KEY_SANDBOX;

  return {
    instance_id: instanceId,
    org_id: 'solamp',
    api_keys: {
      elevenlabs: defaultKey || '',
    },
    rate_limits: {
      elevenlabs: {
        rpm: 100,
        tpm: 500000, // Characters per month
      },
    },
    r2_bucket: 'living-arts',
  };
}

/**
 * Generate hash from audio data for unique filename
 */
async function generateHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 8); // Use first 8 characters
}

/**
 * Create error response
 */
function createErrorResponse(
  message: string,
  code: string,
  requestId: string,
  status: number,
  details?: Record<string, any>
): Response {
  const errorResponse: ErrorResponse = {
    error: message,
    error_code: code,
    request_id: requestId,
    details,
  };

  return Response.json(errorResponse, {
    status,
    headers: {
      'X-Request-ID': requestId,
    },
  });
}
