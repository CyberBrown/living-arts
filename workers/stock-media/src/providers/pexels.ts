import type {
  StockMediaProvider,
  SearchResponse,
  SearchOptions,
  Video,
  VideoFile,
  DownloadOptions,
  DownloadResult,
} from './types';

interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: Array<{
    id: number;
    width: number;
    height: number;
    duration: number;
    url: string;
    image: string;
    video_files: Array<{
      id: number;
      quality: string;
      file_type: string;
      width: number | null;
      height: number | null;
      fps?: number;
      link: string;
    }>;
    video_pictures: Array<{
      id: number;
      picture: string;
      nr: number;
    }>;
    user: {
      id: number;
      name: string;
      url: string;
    };
  }>;
}

interface PexelsVideoResponse {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: Array<{
    id: number;
    quality: string;
    file_type: string;
    width: number | null;
    height: number | null;
    fps?: number;
    link: string;
  }>;
  video_pictures: Array<{
    id: number;
    picture: string;
    nr: number;
  }>;
  user: {
    id: number;
    name: string;
    url: string;
  };
}

export class PexelsProvider implements StockMediaProvider {
  private apiKey: string;
  private baseUrl = 'https://api.pexels.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchVideos(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      query,
      per_page: String(options.per_page || 15),
      page: String(options.page || 1),
    });

    if (options.orientation) {
      params.set('orientation', options.orientation);
    }
    if (options.size) {
      params.set('size', options.size);
    }

    const response = await fetch(
      `${this.baseUrl}/videos/search?${params.toString()}`,
      {
        headers: {
          Authorization: this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Pexels API error: ${response.status} ${response.statusText}`
      );
    }

    const data: PexelsSearchResponse = await response.json();

    return {
      total_results: data.total_results,
      page: data.page,
      per_page: data.per_page,
      videos: data.videos.map((v) => this.normalizeVideo(v)),
    };
  }

  async getVideo(id: number): Promise<Video> {
    const response = await fetch(`${this.baseUrl}/videos/videos/${id}`, {
      headers: {
        Authorization: this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Pexels API error: ${response.status} ${response.statusText}`
      );
    }

    const data: PexelsVideoResponse = await response.json();
    return this.normalizeVideo(data);
  }

  async downloadVideo(
    video: Video,
    r2Path: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    throw new Error('downloadVideo must be called with R2 bucket binding');
  }

  async downloadVideoToR2(
    video: Video,
    r2Path: string,
    r2Bucket: R2Bucket,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const videoFile = this.selectBestVideoFile(video.video_files, options);

    if (!videoFile) {
      throw new Error('No suitable video file found');
    }

    const response = await fetch(videoFile.link);

    if (!response.ok) {
      throw new Error(
        `Failed to download video: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers.get('content-length');
    const sizeBytes = contentLength ? parseInt(contentLength, 10) : 0;

    await r2Bucket.put(r2Path, response.body, {
      httpMetadata: {
        contentType: 'video/mp4',
      },
      customMetadata: {
        photographer: video.user.name,
        photographer_url: video.user.url,
        source: 'Pexels',
        source_url: video.url,
        video_id: String(video.id),
      },
    });

    const publicUrl = `https://stock-media.distributedelectrons.com/video/${r2Path}`;

    return {
      url: publicUrl,
      r2_path: r2Path,
      duration: video.duration,
      width: videoFile.width,
      height: videoFile.height,
      size_bytes: sizeBytes,
      attribution: {
        photographer: video.user.name,
        photographer_url: video.user.url,
        source: 'Pexels',
        source_url: video.url,
      },
    };
  }

  private normalizeVideo(v: PexelsVideoResponse | PexelsSearchResponse['videos'][0]): Video {
    return {
      id: v.id,
      width: v.width,
      height: v.height,
      duration: v.duration,
      url: v.url,
      image: v.image,
      video_files: v.video_files
        .filter((vf) => vf.width !== null && vf.height !== null)
        .map((vf) => ({
          id: vf.id,
          quality: vf.quality,
          file_type: vf.file_type,
          width: vf.width!,
          height: vf.height!,
          fps: vf.fps,
          link: vf.link,
        })),
      user: {
        name: v.user.name,
        url: v.user.url,
      },
    };
  }

  private selectBestVideoFile(
    videoFiles: VideoFile[],
    options: DownloadOptions
  ): VideoFile | null {
    const qualityPreference = options.quality || 'hd';

    const qualityMap: Record<string, string[]> = {
      uhd: ['uhd', 'hd', 'sd'],
      hd: ['hd', 'sd'],
      sd: ['sd', 'hd'],
    };

    const preferredQualities = qualityMap[qualityPreference] || ['hd', 'sd'];

    for (const quality of preferredQualities) {
      const file = videoFiles.find(
        (vf) => vf.quality === quality && vf.file_type === 'video/mp4'
      );
      if (file) {
        return file;
      }
    }

    return videoFiles.find((vf) => vf.file_type === 'video/mp4') || null;
  }
}
