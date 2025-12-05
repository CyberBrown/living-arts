export interface VideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps?: number;
  link: string;
}

export interface Video {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: VideoFile[];
  user: {
    name: string;
    url: string;
  };
}

export interface SearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  videos: Video[];
}

export interface SearchOptions {
  orientation?: 'landscape' | 'portrait' | 'square';
  size?: 'large' | 'medium' | 'small';
  per_page?: number;
  page?: number;
}

export interface DownloadOptions {
  quality?: 'hd' | 'sd' | 'uhd';
  max_duration?: number;
}

export interface Attribution {
  photographer: string;
  photographer_url: string;
  source: string;
  source_url: string;
}

export interface DownloadResult {
  url: string;
  r2_path: string;
  duration: number;
  width: number;
  height: number;
  size_bytes: number;
  attribution: Attribution;
}

export interface StockMediaProvider {
  searchVideos(query: string, options?: SearchOptions): Promise<SearchResponse>;
  getVideo(id: number): Promise<Video>;
  downloadVideo(
    video: Video,
    r2Path: string,
    options?: DownloadOptions
  ): Promise<DownloadResult>;
}
