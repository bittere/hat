export interface CompressionRecord {
  initial_path: string;
  final_path: string;
  initial_size: number;
  compressed_size: number;
  initial_format: string;
  final_format: string;
  quality: number;
  timestamp: number;
  status?: "processing" | "completed" | "failed";
}

export interface CompressionStarted {
  initial_path: string;
  timestamp: number;
}

export interface CompressionFailed {
  initial_path: string;
  timestamp: number;
  error: string;
}

export interface CompressionRetry {
  path: string;
  attempt: number;
  original_quality: number;
  retry_quality: number;
  initial_size: number;
  compressed_size: number;
}
