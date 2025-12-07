// Our Timeline Format
export interface OurTimeline {
  duration: number;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  tracks: {
    video: VideoTrack[];
    audio: AudioTrack[];
    overlay: OverlayTrack[];
  };
  soundtrack?: Soundtrack;
}

export interface VideoTrack {
  id: string;
  clips: VideoClip[];
}

export interface AudioTrack {
  id: string;
  clips: AudioClip[];
}

export interface OverlayTrack {
  id: string;
  clips: OverlayClip[];
}

export interface VideoClip {
  id: string;
  type: 'stock' | 'upload';
  src: string;
  start: number;
  duration: number;
  transition?: {
    type: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight';
    duration: number;
  };
  volume?: number;
}

export interface AudioClip {
  id: string;
  type: 'voiceover' | 'upload';
  src: string;
  start: number;
  duration: number;
  volume?: number;
}

export interface OverlayClip {
  id: string;
  type: 'text' | 'html';
  content: string;
  start: number;
  duration: number;
  position?: {
    x: number;
    y: number;
  };
  style?: Record<string, string>;
}

export interface Soundtrack {
  src: string;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

// Shotstack Format
export interface ShotstackEdit {
  timeline: {
    soundtrack?: {
      src: string;
      effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
      volume?: number;
    };
    background?: string;
    tracks: ShotstackTrack[];
  };
  output: {
    format: 'mp4' | 'gif' | 'mp3';
    resolution: 'sd' | 'hd' | '1080' | '4k';
    fps?: number;
  };
  callback?: string;
}

export interface ShotstackTrack {
  clips: ShotstackClip[];
}

export interface ShotstackClip {
  asset: VideoAsset | ImageAsset | TitleAsset | AudioAsset | HtmlAsset;
  start: number;
  length: number;
  transition?: {
    in?: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight';
    out?: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight';
  };
  offset?: number;
}

export interface VideoAsset {
  type: 'video';
  src: string;
  trim?: number;
  volume?: number;
  crop?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

export interface ImageAsset {
  type: 'image';
  src: string;
  crop?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

export interface TitleAsset {
  type: 'title';
  text: string;
  style?: string;
  color?: string;
  size?: string;
  background?: string;
  position?: 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left' | 'topLeft' | 'center';
  offset?: {
    x?: number;
    y?: number;
  };
}

export interface AudioAsset {
  type: 'audio';
  src: string;
  trim?: number;
  volume?: number;
  effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
}

export interface HtmlAsset {
  type: 'html';
  html: string;
  css?: string;
  width?: number;
  height?: number;
  background?: string;
  position?: 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left' | 'topLeft' | 'center';
}

// API Request/Response Types
export interface RenderRequest {
  instance_id: string;
  project_id: string;
  timeline: OurTimeline;
  options?: {
    format?: 'mp4' | 'gif' | 'mp3';
    resolution?: 'sd' | 'hd' | '1080' | '4k';
    webhook_url?: string;
  };
}

export interface RenderResponse {
  success: boolean;
  data?: {
    render_id: string;
    status: string;
    estimated_time?: number;
    webhook_configured?: boolean;
  };
  error?: string;
  request_id: string;
  timestamp: string;
}

export interface StatusResponse {
  success: boolean;
  data?: {
    render_id: string;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    progress?: number;
    url?: string;
    error?: string;
  };
  error?: string;
}

export interface ShotstackWebhook {
  type: string;
  action: string;
  id: string;
  owner: string;
  status: string;
  url?: string;
  error?: string;
  data?: {
    output?: Record<string, unknown>;
    timeline?: Record<string, unknown>;
  };
}

// Shotstack API Response Types
export interface ShotstackRenderResponse {
  success: boolean;
  message: string;
  response: {
    message: string;
    id: string;
  };
}

export interface ShotstackStatusResponse {
  success: boolean;
  response: {
    id: string;
    owner: string;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    error?: string;
    duration?: number;
    renderTime?: number;
    url?: string;
    poster?: string;
    thumbnail?: string;
    data?: {
      output?: Record<string, unknown>;
      timeline?: Record<string, unknown>;
    };
  };
}

// KV Storage Types
export interface RenderJob {
  project_id: string;
  instance_id: string;
  status: string;
  created_at: string;
  webhook_url?: string;
  shotstack_id: string;
}

// Worker Environment Bindings
export interface Env {
  ENVIRONMENT: string;
  SHOTSTACK_API_KEY?: string;  // Production key (Cloudflare Secret)
  SHOTSTACK_API_KEY_SANDBOX: string;  // Sandbox key (wrangler.toml)
  SHOTSTACK_ENV: string;
  CONFIG_SERVICE_URL: string;

  // Bindings
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  PROVIDER_KEYS: KVNamespace;
  RENDER_JOBS: KVNamespace;
  RATE_LIMITER?: DurableObjectNamespace;
}
