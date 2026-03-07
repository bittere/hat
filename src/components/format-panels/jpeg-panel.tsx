import { FormatQualitySlider } from "@/components/format-quality-slider";
import { OptionSelect } from "@/components/option-select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { SUBSAMPLE_OPTIONS } from "@/lib/format-option-constants";
import type { JpegConfig } from "@/lib/types";

interface JpegPanelProps {
	config: JpegConfig;
	onQualityChange: (value: number) => void;
	onFieldChange: (field: string, value: unknown) => void;
}

export function JpegPanel({ config, onQualityChange, onFieldChange }: JpegPanelProps) {
	return (
		<div className="space-y-3 pr-8">
			<FormatQualitySlider label="Quality" value={config.quality} onValueChange={onQualityChange} />
			<SettingsSwitch
				checked={config.optimize_coding}
				onCheckedChange={(val) => onFieldChange("optimize_coding", val)}
				title="Optimize Coding"
				description="Use optimal Huffman coding tables for smaller files."
			/>
			<SettingsSwitch
				checked={config.interlace}
				onCheckedChange={(val) => onFieldChange("interlace", val)}
				title="Progressive (Interlace)"
				description="Write progressive JPEG for faster perceived loading."
			/>
			<OptionSelect
				label="Chroma Subsampling"
				description="Control color channel downsampling."
				value={config.subsample_mode}
				onValueChange={(val) => onFieldChange("subsample_mode", val)}
				options={SUBSAMPLE_OPTIONS}
				placeholder="Auto"
			/>
			<SettingsSwitch
				checked={config.trellis_quant}
				onCheckedChange={(val) => onFieldChange("trellis_quant", val)}
				title="Trellis Quantization"
				description="Better compression at the cost of speed. Requires mozjpeg."
			/>
			<SettingsSwitch
				checked={config.overshoot_deringing}
				onCheckedChange={(val) => onFieldChange("overshoot_deringing", val)}
				title="Overshoot Deringing"
				description="Reduce ringing artifacts. Requires mozjpeg."
			/>
		</div>
	);
}
