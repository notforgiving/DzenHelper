export interface ProcessingResult {
  videoUrl: string;
  transcription: string;
  article: string;
  imagePath?: string;
}

export interface YouTubeVideoInfo {
  title: string;
  duration: number;
  url: string;
}

export interface TranscriptionChunk {
  text: string;
  start: number;
  end: number;
}




