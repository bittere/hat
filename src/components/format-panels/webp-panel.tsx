import { FormatQualitySlider } from "@/components/format-quality-slider";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import type { WebpConfig } from "@/lib/types";

interface WebpPanelProps {
	config: WebpConfig;
	onQualityChange: (value: number) => void;
	onFieldChange: (field: string, value: unknown) => void;
}

export function WebpPanel({ config, onQualityChange, onFieldChange }: WebpPanelProps) {
	return (
		<div className="space-y-3 pr-8">
			<FormatQualitySlider label="Quality" value={config.quality} onValueChange={onQualityChange} />
			<FormatQualitySlider
				label="Effort"
				value={config.effort}
				onValueChange={(val) => onFieldChange("effort", val)}
				min={0}
				max={6}
			/>
			<SettingsSwitch
				checked={config.lossless}
				onCheckedChange={(val) => onFieldChange("lossless", val)}
				title="Lossless"
				description="Encode lossless WebP. Quality slider is ignored in lossless mode."
			/>
			<SettingsSwitch
				checked={config.near_lossless}
				onCheckedChange={(val) => onFieldChange("near_lossless", val)}
				title="Near Lossless"
				description="Near-lossless preprocessing for better compression with minimal quality loss."
			/>
			<SettingsSwitch
				checked={config.smart_subsample}
				onCheckedChange={(val) => onFieldChange("smart_subsample", val)}
				title="Smart Subsampling"
				description="Higher quality chroma subsampling."
			/>
			<FormatQualitySlider
				label="Alpha Quality"
				value={config.alpha_q}
				onValueChange={(val) => onFieldChange("alpha_q", val)}
				min={1}
				max={100}
			/>
		</div>
	);
}
