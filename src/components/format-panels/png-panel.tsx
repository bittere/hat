import { FormatQualitySlider } from "@/components/format-quality-slider";
import { OptionSelect } from "@/components/option-select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { PNG_BITDEPTH_OPTIONS, PNG_FILTER_OPTIONS } from "@/lib/format-option-constants";
import type { PngConfig } from "@/lib/types";

interface PngPanelProps {
	config: PngConfig;
	onQualityChange: (value: number) => void;
	onFieldChange: (field: string, value: unknown) => void;
}

export function PngPanel({ config, onQualityChange, onFieldChange }: PngPanelProps) {
	return (
		<div className="space-y-3 pr-8">
			<FormatQualitySlider label="Quality" value={config.quality} onValueChange={onQualityChange} />
			<SettingsSwitch
				checked={config.palette}
				onCheckedChange={(val) => onFieldChange("palette", val)}
				title="Palette"
				description="Reduce to indexed colors for smaller file sizes. Best for graphics and icons."
			/>
			{config.palette && (
				<FormatQualitySlider
					label="Max Colors"
					value={config.colors}
					onValueChange={(val) => onFieldChange("colors", val)}
					min={2}
					max={256}
				/>
			)}
			<SettingsSwitch
				checked={config.interlace}
				onCheckedChange={(val) => onFieldChange("interlace", val)}
				title="Interlace (Adam7)"
				description="Enable progressive loading for PNG images."
			/>
			<OptionSelect
				label="Bit Depth"
				value={config.bitdepth > 0 ? String(config.bitdepth) : null}
				onValueChange={(val) => onFieldChange("bitdepth", val ? Number(val) : 0)}
				options={PNG_BITDEPTH_OPTIONS}
			/>
			<OptionSelect
				label="Filter"
				description="PNG row filter strategy. 'All' enables adaptive filtering."
				value={config.filter}
				onValueChange={(val) => onFieldChange("filter", val)}
				options={PNG_FILTER_OPTIONS}
			/>
		</div>
	);
}
