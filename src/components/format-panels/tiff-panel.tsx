import { FormatQualitySlider } from "@/components/format-quality-slider";
import { OptionSelect } from "@/components/option-select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import {
	TIFF_BITDEPTH_OPTIONS,
	TIFF_COMPRESSION_OPTIONS,
	TIFF_PREDICTOR_OPTIONS,
} from "@/lib/format-option-constants";
import type { TiffConfig } from "@/lib/types";

interface TiffPanelProps {
	config: TiffConfig;
	onQualityChange: (value: number) => void;
	onFieldChange: (field: string, value: unknown) => void;
}

export function TiffPanel({ config, onQualityChange, onFieldChange }: TiffPanelProps) {
	return (
		<div className="space-y-3 pr-8">
			<FormatQualitySlider label="Quality" value={config.quality} onValueChange={onQualityChange} />
			<OptionSelect
				label="Compression"
				description="TIFF compression algorithm."
				value={config.compression}
				onValueChange={(val) => onFieldChange("compression", val)}
				options={TIFF_COMPRESSION_OPTIONS}
				placeholder="Deflate (default)"
			/>
			<OptionSelect
				label="Predictor"
				description="Row predictor for lossless compression."
				value={config.predictor}
				onValueChange={(val) => onFieldChange("predictor", val)}
				options={TIFF_PREDICTOR_OPTIONS}
				placeholder="Horizontal (default)"
			/>
			<SettingsSwitch
				checked={config.tile}
				onCheckedChange={(val) => onFieldChange("tile", val)}
				title="Tiled"
				description="Write tiled TIFF instead of strips."
			/>
			<SettingsSwitch
				checked={config.pyramid}
				onCheckedChange={(val) => onFieldChange("pyramid", val)}
				title="Pyramid"
				description="Write an image pyramid (multi-resolution)."
			/>
			<OptionSelect
				label="Bit Depth"
				value={config.bitdepth > 0 ? String(config.bitdepth) : null}
				onValueChange={(val) => onFieldChange("bitdepth", val ? Number(val) : 0)}
				options={TIFF_BITDEPTH_OPTIONS}
			/>
			<SettingsSwitch
				checked={config.quantize}
				onCheckedChange={(val) => onFieldChange("quantize", val)}
				title="Quantize Colors"
				description="Reduce color palette for better compression. Colors are reduced then re-encoded."
			/>
			{config.quantize && (
				<FormatQualitySlider
					label="Max Colors"
					value={config.colors}
					onValueChange={(val) => onFieldChange("colors", val)}
					min={2}
					max={256}
				/>
			)}
		</div>
	);
}
