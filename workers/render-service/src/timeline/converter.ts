import type {
  OurTimeline,
  ShotstackEdit,
  ShotstackTrack,
  ShotstackClip,
  VideoAsset,
  AudioAsset,
  TitleAsset,
  HtmlAsset,
} from '../types';

export class TimelineConverter {
  /**
   * Convert our timeline format to Shotstack format
   */
  convert(
    timeline: OurTimeline,
    options?: {
      format?: 'mp4' | 'gif' | 'mp3';
      resolution?: 'sd' | 'hd' | '1080' | '4k';
      webhook_url?: string;
    }
  ): ShotstackEdit {
    const tracks: ShotstackTrack[] = [];

    // Ensure all track arrays exist (may be undefined in input)
    const overlayTracks = timeline.tracks?.overlay || [];
    const videoTracks = timeline.tracks?.video || [];
    const audioTracks = timeline.tracks?.audio || [];

    // Convert overlay tracks (rendered on top)
    for (const overlayTrack of overlayTracks) {
      const clips: ShotstackClip[] = [];
      for (const clip of overlayTrack.clips) {
        clips.push(this.convertOverlayClip(clip));
      }
      if (clips.length > 0) {
        tracks.push({ clips });
      }
    }

    // Convert video tracks (middle layer)
    for (const videoTrack of videoTracks) {
      const clips: ShotstackClip[] = [];
      for (const clip of videoTrack.clips) {
        clips.push(this.convertVideoClip(clip));
      }
      if (clips.length > 0) {
        tracks.push({ clips });
      }
    }

    // Convert audio tracks (separate from video layers)
    for (const audioTrack of audioTracks) {
      const clips: ShotstackClip[] = [];
      for (const clip of audioTrack.clips) {
        clips.push(this.convertAudioClip(clip));
      }
      if (clips.length > 0) {
        tracks.push({ clips });
      }
    }

    // Build the Shotstack edit
    const edit: ShotstackEdit = {
      timeline: {
        tracks,
      },
      output: {
        format: options?.format || 'mp4',
        resolution: options?.resolution || 'hd',
        fps: timeline.fps,
      },
    };

    // Add soundtrack if present
    if (timeline.soundtrack) {
      edit.timeline.soundtrack = {
        src: timeline.soundtrack.src,
        volume: timeline.soundtrack.volume ?? 1,
      };

      // Determine fade effect
      if (timeline.soundtrack.fadeIn && timeline.soundtrack.fadeOut) {
        edit.timeline.soundtrack.effect = 'fadeInFadeOut';
      } else if (timeline.soundtrack.fadeIn) {
        edit.timeline.soundtrack.effect = 'fadeIn';
      } else if (timeline.soundtrack.fadeOut) {
        edit.timeline.soundtrack.effect = 'fadeOut';
      }
    }

    // Add webhook callback if provided
    if (options?.webhook_url) {
      edit.callback = options.webhook_url;
    }

    return edit;
  }

  /**
   * Convert a video clip to Shotstack format
   */
  private convertVideoClip(clip: any): ShotstackClip {
    const asset: VideoAsset = {
      type: 'video',
      src: clip.src,
      volume: clip.volume ?? 1,
    };

    const shotstackClip: ShotstackClip = {
      asset,
      start: clip.start,
      length: clip.duration,
    };

    // Add transition if present
    if (clip.transition) {
      shotstackClip.transition = {
        in: clip.transition.type,
      };
    }

    return shotstackClip;
  }

  /**
   * Convert an audio clip to Shotstack format
   */
  private convertAudioClip(clip: any): ShotstackClip {
    const asset: AudioAsset = {
      type: 'audio',
      src: clip.src,
      volume: clip.volume ?? 1,
    };

    return {
      asset,
      start: clip.start,
      length: clip.duration,
    };
  }

  /**
   * Convert an overlay clip to Shotstack format
   */
  private convertOverlayClip(clip: any): ShotstackClip {
    let asset: TitleAsset | HtmlAsset;

    if (clip.type === 'text') {
      // Use TitleAsset for simple text overlays
      asset = {
        type: 'title',
        text: clip.content,
        position: this.convertPosition(clip.position),
      };

      // Apply styles if present
      if (clip.style) {
        if (clip.style.color) asset.color = clip.style.color;
        if (clip.style.size) asset.size = clip.style.size;
        if (clip.style.background) asset.background = clip.style.background;
      }
    } else {
      // Use HtmlAsset for HTML overlays
      asset = {
        type: 'html',
        html: clip.content,
        position: this.convertPosition(clip.position),
      };

      if (clip.style?.css) {
        asset.css = clip.style.css;
      }
    }

    return {
      asset,
      start: clip.start,
      length: clip.duration,
    };
  }

  /**
   * Convert position coordinates to Shotstack position string
   */
  private convertPosition(position?: {
    x: number;
    y: number;
  }): 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left' | 'topLeft' | 'center' {
    if (!position) return 'center';

    // Simple mapping based on x,y coordinates
    // Assume coordinates are normalized 0-1
    const { x, y } = position;

    if (y < 0.33) {
      if (x < 0.33) return 'topLeft';
      if (x > 0.66) return 'topRight';
      return 'top';
    } else if (y > 0.66) {
      if (x < 0.33) return 'bottomLeft';
      if (x > 0.66) return 'bottomRight';
      return 'bottom';
    } else {
      if (x < 0.33) return 'left';
      if (x > 0.66) return 'right';
      return 'center';
    }
  }
}
