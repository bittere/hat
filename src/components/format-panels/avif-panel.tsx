import { FormatQualitySlider } from "@/components/format-quality-slider";
import { OptionSelect } from "@/components/option-select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { HEIF_BITDEPTH_OPTIONS, SUBSAMPLE_OPTIONS } from "@/lib/format-option-constants";
import type { AvifConfig } from "@/lib/types";

interface AvifPanelProps {
	config: AvifConfig;
	onQualityChange: (value: number) => void;
	onFieldChange: (field: string, value: unknown) => void;
}

export function AvifPanel({ config, onQualityChange, onFieldChange }: AvifPanelProps) {
	return (
		<div className="space-y-3 pr-8">
			<FormatQualitySlider label="Quality" value={config.quality} onValueChange={onQualityChange} />
			<FormatQualitySlider
				label="Effort"
				value={config.effort}
				onValueChange={(val) => onFieldChange("effort", val)}
				min={0}
				max={9}
			/>
			<SettingsSwitch
				checked={config.lossless}
				onCheckedChange={(val) => onFieldChange("lossless", val)}
				title="Lossless"
				description="Encode lossless AVIF."
			/>
			<OptionSelect
				label="Bit Depth"
				value={config.bitdepth > 0 ? String(config.bitdepth) : null}
				onValueChange={(val) => onFieldChange("bitdepth", val ? Number(val) : 0)}
				options={HEIF_BITDEPTH_OPTIONS}
			/>
			<OptionSelect
				label="Chroma Subsampling"
				value={config.subsample_mode}
				onValueChange={(val) => onFieldChange("subsample_mode", val)}
				options={SUBSAMPLE_OPTIONS}
				placeholder="Auto"
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
