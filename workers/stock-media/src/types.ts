export interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  PROVIDER_KEYS: KVNamespace;
  SEARCH_CACHE?: KVNamespace;
  ENVIRONMENT: string;
  PEXELS_API_KEY?: string;  // Production key (Cloudflare Secret)
  PEXELS_API_KEY_SANDBOX: string;  // Sandbox key (wrangler.toml)
  DEFAULT_PROVIDER: string;
  CONFIG_SERVICE_URL: string;
}

export interface SearchRequest {
  instance_id: string;
  query: string;
  options?: {
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
    per_page?: number;
    page?: number;
  };
}

export interface DownloadRequest {
  instance_id: string;
  project_id: string;
  video_id: number;
  options?: {
    quality?: 'hd' | 'sd' | 'uhd';
    max_duration?: number;
  };
}

export interface BatchSearchQuery {
  id: string;
  query: string;
  per_page?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  size?: 'large' | 'medium' | 'small';
}

export interface BatchSearchRequest {
  instance_id: string;
  queries: BatchSearchQuery[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  request_id: string;
  timestamp: string;
}
