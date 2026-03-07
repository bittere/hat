export const SUBSAMPLE_OPTIONS = [
	{ value: "on", label: "On" },
	{ value: "off", label: "Off" },
];

export const PNG_FILTER_OPTIONS = [
	{ value: "none", label: "None" },
	{ value: "sub", label: "Sub" },
	{ value: "up", label: "Up" },
	{ value: "avg", label: "Average" },
	{ value: "paeth", label: "Paeth" },
	{ value: "all", label: "All (Adaptive)" },
];

export const PNG_BITDEPTH_OPTIONS = [
	{ value: "1", label: "1" },
	{ value: "2", label: "2" },
	{ value: "4", label: "4" },
	{ value: "8", label: "8" },
	{ value: "16", label: "16" },
];

export const HEIF_BITDEPTH_OPTIONS = [
	{ value: "8", label: "8-bit" },
	{ value: "10", label: "10-bit" },
	{ value: "12", label: "12-bit" },
];

export const TIFF_COMPRESSION_OPTIONS = [
	{ value: "none", label: "None" },
	{ value: "jpeg", label: "JPEG" },
	{ value: "deflate", label: "Deflate" },
	{ value: "lzw", label: "LZW" },
	{ value: "zstd", label: "Zstd" },
	{ value: "webp", label: "WebP" },
	{ value: "packbits", label: "PackBits" },
];

export const TIFF_PREDICTOR_OPTIONS = [
	{ value: "none", label: "None" },
	{ value: "horizontal", label: "Horizontal" },
	{ value: "float", label: "Float" },
];

export const TIFF_BITDEPTH_OPTIONS = [
	{ value: "1", label: "1-bit" },
	{ value: "2", label: "2-bit" },
	{ value: "4", label: "4-bit" },
];
