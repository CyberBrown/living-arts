import { PexelsProvider } from './providers/pexels';
import { validateInstanceId, validateProjectAccess } from './auth';
import type {
  Env,
  SearchRequest,
  DownloadRequest,
  BatchSearchRequest,
  ApiResponse,
} from './types';
import type { SearchResponse, DownloadResult } from './providers/types';

const CACHE_TTL = 3600; // 1 hour

function generateRequestId(): string {
  return crypto.randomUUID();
}

function createResponse<T>(
  success: boolean,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    request_id: generateRequestId(),
    timestamp: new Date().toISOString(),
  };
}

function jsonResponse<T>(
  response: ApiResponse<T>,
  status = 200
): Response {
  return new Response(JSON.stringify(response, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function handleSearch(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: SearchRequest = await request.json();

    if (!body.instance_id || !body.query) {
      return jsonResponse(
        createResponse(false, undefined, 'Missing instance_id or query'),
        400
      );
    }

    const isValid = await validateInstanceId(body.instance_id, env);
    if (!isValid) {
      return jsonResponse(
        createResponse(false, undefined, 'Invalid instance_id'),
        403
      );
    }

    const cacheKey = `search:${body.query}:${JSON.stringify(body.options || {})}`;
    const cached = env.SEARCH_CACHE
      ? await env.SEARCH_CACHE.get(cacheKey, 'json')
      : null;

    if (cached) {
      return jsonResponse(createResponse(true, cached as SearchResponse));
    }

    const apiKey = env.PEXELS_API_KEY;
    const provider = new PexelsProvider(apiKey);

    const results = await provider.searchVideos(body.query, body.options);

    if (env.SEARCH_CACHE) {
      await env.SEARCH_CACHE.put(cacheKey, JSON.stringify(results), {
        expirationTtl: CACHE_TTL,
      });
    }

    return jsonResponse(createResponse(true, results));
  } catch (error) {
    console.error('Search error:', error);
    return jsonResponse(
      createResponse(
        false,
        undefined,
        error instanceof Error ? error.message : 'Internal server error'
      ),
      500
    );
  }
}

async function handleDownload(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: DownloadRequest = await request.json();

    if (!body.instance_id || !body.project_id || !body.video_id) {
      return jsonResponse(
        createResponse(
          false,
          undefined,
          'Missing instance_id, project_id, or video_id'
        ),
        400
      );
    }

    const isValidInstance = await validateInstanceId(body.instance_id, env);
    if (!isValidInstance) {
      return jsonResponse(
        createResponse(false, undefined, 'Invalid instance_id'),
        403
      );
    }

    const isValidProject = await validateProjectAccess(
      body.instance_id,
      body.project_id,
      env
    );
    if (!isValidProject) {
      return jsonResponse(
        createResponse(
          false,
          undefined,
          'Invalid project_id or access denied'
        ),
        403
      );
    }

    const apiKey = env.PEXELS_API_KEY;
    const provider = new PexelsProvider(apiKey);

    const video = await provider.getVideo(body.video_id);

    const r2Path = `${body.instance_id}/${body.project_id}/stock/pexels_${body.video_id}.mp4`;

    const result = await provider.downloadVideoToR2(
      video,
      r2Path,
      env.R2_BUCKET,
      body.options
    );

    return jsonResponse(createResponse(true, result));
  } catch (error) {
    console.error('Download error:', error);
    return jsonResponse(
      createResponse(
        false,
        undefined,
        error instanceof Error ? error.message : 'Internal server error'
      ),
      500
    );
  }
}

async function handleBatchSearch(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: BatchSearchRequest = await request.json();

    if (!body.instance_id || !body.queries || body.queries.length === 0) {
      return jsonResponse(
        createResponse(false, undefined, 'Missing instance_id or queries'),
        400
      );
    }

    const isValid = await validateInstanceId(body.instance_id, env);
    if (!isValid) {
      return jsonResponse(
        createResponse(false, undefined, 'Invalid instance_id'),
        403
      );
    }

    const apiKey = env.PEXELS_API_KEY;
    const provider = new PexelsProvider(apiKey);

    const results: Record<string, { videos: SearchResponse['videos'] }> = {};

    for (const queryItem of body.queries) {
      try {
        const cacheKey = `search:${queryItem.query}:${JSON.stringify({
          per_page: queryItem.per_page,
          orientation: queryItem.orientation,
          size: queryItem.size,
        })}`;
        const cached = env.SEARCH_CACHE
          ? await env.SEARCH_CACHE.get(cacheKey, 'json')
          : null;

        let searchResult: SearchResponse;

        if (cached) {
          searchResult = cached as SearchResponse;
        } else {
          searchResult = await provider.searchVideos(queryItem.query, {
            per_page: queryItem.per_page,
            orientation: queryItem.orientation,
            size: queryItem.size,
          });

          if (env.SEARCH_CACHE) {
            await env.SEARCH_CACHE.put(cacheKey, JSON.stringify(searchResult), {
              expirationTtl: CACHE_TTL,
            });
          }
        }

        results[queryItem.id] = {
          videos: searchResult.videos,
        };
      } catch (error) {
        console.error(`Error searching for ${queryItem.id}:`, error);
        results[queryItem.id] = {
          videos: [],
        };
      }
    }

    return jsonResponse(createResponse(true, { results }));
  } catch (error) {
    console.error('Batch search error:', error);
    return jsonResponse(
      createResponse(
        false,
        undefined,
        error instanceof Error ? error.message : 'Internal server error'
      ),
      500
    );
  }
}

async function handleHealth(): Promise<Response> {
  return jsonResponse(
    createResponse(true, {
      status: 'healthy',
      service: 'stock-media',
      version: '1.0.0',
    })
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return handleHealth();
    }

    if (url.pathname === '/search' && request.method === 'POST') {
      return handleSearch(request, env);
    }

    if (url.pathname === '/download' && request.method === 'POST') {
      return handleDownload(request, env);
    }

    if (url.pathname === '/batch-search' && request.method === 'POST') {
      return handleBatchSearch(request, env);
    }

    return jsonResponse(
      createResponse(false, undefined, 'Not found'),
      404
    );
  },
};
