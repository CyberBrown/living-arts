import type {
  ShotstackEdit,
  ShotstackRenderResponse,
  ShotstackStatusResponse,
} from '../types';

export class ShotstackProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, env: string = 'stage') {
    this.apiKey = apiKey;
    this.baseUrl = `https://api.shotstack.io/${env}`;
  }

  /**
   * Submit a video for rendering
   */
  async render(edit: ShotstackEdit): Promise<ShotstackRenderResponse> {
    const response = await fetch(`${this.baseUrl}/render`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(edit),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Shotstack render failed: ${response.status} ${response.statusText} - ${error}`
      );
    }

    return response.json();
  }

  /**
   * Get the status of a render job
   */
  async getStatus(renderId: string): Promise<ShotstackStatusResponse> {
    const response = await fetch(`${this.baseUrl}/render/${renderId}`, {
      method: 'GET',
      headers: {
        'x-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Shotstack status check failed: ${response.status} ${response.statusText} - ${error}`
      );
    }

    return response.json();
  }

  /**
   * Download rendered video from CDN
   */
  async downloadVideo(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download video: ${response.status} ${response.statusText}`
      );
    }

    return response.arrayBuffer();
  }
}
