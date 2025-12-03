/**
 * ElevenLabs Provider Adapter
 * Handles integration with ElevenLabs Text-to-Speech API
 */

import type {
  AudioGenerationOptions,
  AudioResult,
  ElevenLabsTTSRequest,
  ElevenLabsVoice,
} from '../types';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Generate speech from text using ElevenLabs API
 */
export async function generateSpeech(
  text: string,
  options: AudioGenerationOptions,
  apiKey: string
): Promise<AudioResult> {
  const voiceId = options.voice_id || 'Rachel';
  const modelId = options.model_id || 'eleven_monolingual_v1';
  const stability = options.stability ?? 0.5;
  const similarityBoost = options.similarity_boost ?? 0.75;

  // Prepare request body
  const requestBody: ElevenLabsTTSRequest = {
    text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarityBoost,
    },
  };

  // Call ElevenLabs TTS API
  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    await handleElevenLabsError(response);
  }

  // Get audio data
  const audioData = await response.arrayBuffer();

  // Calculate character count
  const characterCount = text.length;

  // Estimate duration using proper calculation (~150 words per minute)
  const estimatedDuration = estimateAudioDuration(characterCount);

  return {
    audio_data: audioData,
    duration_seconds: estimatedDuration,
    character_count: characterCount,
    provider: 'elevenlabs',
    voice_id: voiceId,
    model_id: modelId,
    metadata: {
      stability,
      similarity_boost: similarityBoost,
      output_format: options.output_format || 'mp3_44100_128',
    },
  };
}

/**
 * List available voices from ElevenLabs
 */
export async function listVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
    },
  });

  if (!response.ok) {
    await handleElevenLabsError(response);
  }

  const data = await response.json() as { voices: ElevenLabsVoice[] };
  return data.voices;
}

/**
 * Handle ElevenLabs API errors
 */
async function handleElevenLabsError(response: Response): Promise<never> {
  const status = response.status;
  let errorMessage = `ElevenLabs API error (${status})`;

  try {
    const errorData = await response.json();
    errorMessage = errorData.detail?.message || errorData.message || errorMessage;
  } catch {
    // If we can't parse the error, use the status text
    errorMessage = response.statusText || errorMessage;
  }

  // Map status codes to specific error messages
  switch (status) {
    case 401:
      throw new Error('Invalid ElevenLabs API key');
    case 422:
      throw new Error(`Invalid request parameters: ${errorMessage}`);
    case 429:
      throw new Error('ElevenLabs rate limit exceeded');
    case 500:
    case 502:
    case 503:
      throw new Error('ElevenLabs service temporarily unavailable');
    default:
      throw new Error(errorMessage);
  }
}

/**
 * Calculate actual audio duration from MP3 data
 * This is a simplified approach - for production, you may want to use a proper MP3 parser
 */
export function estimateAudioDuration(
  characterCount: number,
  wordsPerMinute: number = 150
): number {
  // Average word length is ~5 characters
  const wordCount = characterCount / 5;
  // Convert to duration in seconds
  const durationMinutes = wordCount / wordsPerMinute;
  return durationMinutes * 60;
}

/**
 * Get content type for audio format
 */
export function getAudioContentType(format?: string): string {
  switch (format) {
    case 'mp3_44100_128':
    case 'mp3_22050_32':
      return 'audio/mpeg';
    case 'pcm_16000':
      return 'audio/pcm';
    default:
      return 'audio/mpeg';
  }
}
