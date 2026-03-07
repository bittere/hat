import { FormatQualitySlider } from "@/components/format-quality-slider";
import { OptionSelect } from "@/components/option-select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { HEIF_BITDEPTH_OPTIONS } from "@/lib/format-option-constants";
import type { HeifConfig } from "@/lib/types";

interface HeifPanelProps {
	config: HeifConfig;
	onQualityChange: (value: number) => void;
	onFieldChange: (field: string, value: unknown) => void;
}

export function HeifPanel({ config, onQualityChange, onFieldChange }: HeifPanelProps) {
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
				description="Encode lossless HEIF."
			/>
			<OptionSelect
				label="Bit Depth"
				value={config.bitdepth > 0 ? String(config.bitdepth) : null}
				onValueChange={(val) => onFieldChange("bitdepth", val ? Number(val) : 0)}
				options={HEIF_BITDEPTH_OPTIONS}
			/>
		</div>
	);
}
