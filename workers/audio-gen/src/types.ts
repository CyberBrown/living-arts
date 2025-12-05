/**
 * Audio Generation Worker Types
 */

export interface GenerateRequest {
  instance_id: string;
  project_id?: string;
  text: string;
  options?: AudioGenerationOptions;
  save_to_r2?: boolean;
}

export interface AudioGenerationOptions {
  voice_id?: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  output_format?: 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_16000';
  [key: string]: any;
}

export interface GenerateResponse {
  success: boolean;
  data: {
    url: string;
    r2_path: string;
    duration_seconds: number;
    character_count: number;
    metadata: {
      voice_id: string;
      model_id: string;
      provider: string;
    };
  };
  request_id: string;
  timestamp: string;
}

export interface VoicesResponse {
  success: boolean;
  data: {
    voices: Voice[];
  };
}

export interface Voice {
  voice_id: string;
  name: string;
  category: 'premade' | 'cloned';
  labels: Record<string, string>;
}

export interface ErrorResponse {
  error: string;
  error_code: string;
  request_id: string;
  details?: Record<string, any>;
}

export interface Env {
  // Bindings
  R2_BUCKET: R2Bucket;
  DB?: D1Database;
  PROVIDER_KEYS?: KVNamespace;
  RATE_LIMITER?: DurableObjectNamespace;

  // Environment variables
  DEFAULT_VOICE_ID: string;
  DEFAULT_MODEL_ID: string;
  DEFAULT_INSTANCE_ID?: string;
  CONFIG_SERVICE_URL?: string;

  // API Keys (from secrets)
  ELEVENLABS_API_KEY: string;
}

export interface InstanceConfig {
  instance_id: string;
  org_id: string;
  api_keys: Record<string, string>;
  rate_limits: Record<
    string,
    {
      rpm: number;
      tpm: number;
    }
  >;
  r2_bucket?: string;
}

export interface AudioResult {
  audio_data: ArrayBuffer;
  duration_seconds: number;
  character_count: number;
  provider: string;
  voice_id: string;
  model_id: string;
  metadata?: Record<string, any>;
}

export interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface ElevenLabsTTSRequest {
  text: string;
  model_id: string;
  voice_settings: ElevenLabsVoiceSettings;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  description?: string;
  preview_url?: string;
}
