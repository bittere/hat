export interface CompressionRecord {
  initial_path: string;
  final_path: string;
  initial_size: number;
  compressed_size: number;
  initial_format: string;
  final_format: string;
  quality: number;
  timestamp: number;
  original_deleted: boolean;
}

export interface CompressionRetry {
  path: string;
  attempt: number;
  original_quality: number;
  retry_quality: number;
  initial_size: number;
  compressed_size: number;
}
