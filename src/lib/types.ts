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

export interface PngConfig {
	quality: number;
	palette: boolean;
	convert_to: string | null;
	interlace: boolean;
	bitdepth: number;
	filter: string | null;
	colors: number;
}

export interface JpegConfig {
	quality: number;
	convert_to: string | null;
	optimize_coding: boolean;
	interlace: boolean;
	subsample_mode: string | null;
	trellis_quant: boolean;
	overshoot_deringing: boolean;
	quantize: boolean;
	colors: number;
}

export interface WebpConfig {
	quality: number;
	convert_to: string | null;
	effort: number;
	lossless: boolean;
	near_lossless: boolean;
	smart_subsample: boolean;
	alpha_q: number;
	quantize: boolean;
	colors: number;
}

export interface AvifConfig {
	quality: number;
	convert_to: string | null;
	effort: number;
	lossless: boolean;
	bitdepth: number;
	subsample_mode: string | null;
	quantize: boolean;
	colors: number;
}

export interface HeifConfig {
	quality: number;
	convert_to: string | null;
	effort: number;
	lossless: boolean;
	bitdepth: number;
	quantize: boolean;
	colors: number;
}

export interface TiffConfig {
	quality: number;
	convert_to: string | null;
	compression: string | null;
	predictor: string | null;
	tile: boolean;
	pyramid: boolean;
	bitdepth: number;
	quantize: boolean;
	colors: number;
}

export interface FormatOptions {
	png: PngConfig;
	jpeg: JpegConfig;
	webp: WebpConfig;
	avif: AvifConfig;
	heif: HeifConfig;
	tiff: TiffConfig;
}
