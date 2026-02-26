import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormatQualitySlider } from "@/components/format-quality-slider";
import { FORMAT_LABELS, type FormatKey, FormatSelect } from "@/components/format-select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import type { FormatOptions } from "@/lib/types";

export function FormatQualitySettings() {
	const [formatOptions, setFormatOptions] = useState<FormatOptions | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		invoke<FormatOptions>("get_format_options").then(setFormatOptions);
	}, []);

	const updateOptions = useCallback((updater: (prev: FormatOptions) => FormatOptions) => {
		setFormatOptions((prev) => {
			if (!prev) return prev;
			const updated = updater(prev);
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => {
				invoke("set_format_options", { options: updated });
			}, 300);
			return updated;
		});
	}, []);

	const handleQualityChange = useCallback(
		(key: FormatKey, value: number) => {
			updateOptions((prev) => ({
				...prev,
				[key]: { ...prev[key], quality: value },
			}));
		},
		[updateOptions]
	);

	const handlePaletteChange = useCallback(
		(value: boolean) => {
			updateOptions((prev) => ({
				...prev,
				png: { ...prev.png, palette: value },
			}));
		},
		[updateOptions]
	);

	const handleConvertToChange = useCallback(
		(key: FormatKey, value: string | null) => {
			updateOptions((prev) => ({
				...prev,
				[key]: { ...prev[key], convert_to: value },
			}));
		},
		[updateOptions]
	);

	if (!formatOptions) return null;

	return (
		<Tabs className="w-full flex-row" defaultValue="jpeg" orientation="vertical">
			<div className="border-s">
				<TabsList variant="underline">
					{FORMAT_LABELS.map(({ key, label }) => (
						<TabsTab key={key} value={key}>
							{label}
						</TabsTab>
					))}
				</TabsList>
			</div>
			{FORMAT_LABELS.map(({ key }) => (
				<TabsPanel key={key} value={key}>
					<div className="space-y-3">
						<FormatQualitySlider
							label="Quality"
							value={formatOptions[key].quality}
							onValueChange={(val) => handleQualityChange(key, val)}
						/>
						{key === "png" && (
							<SettingsSwitch
								checked={formatOptions.png.palette && formatOptions.png.convert_to === null}
								onCheckedChange={handlePaletteChange}
								title="Palette"
								description="Reduce to 256 colors for smaller file sizes. Best for graphics and icons."
								disabled={formatOptions.png.convert_to !== null}
							/>
						)}
						<div className="flex flex-col items-start gap-1.5">
							<label htmlFor={`convert-to-${key}`} className="font-medium text-foreground text-sm">
								Convert to
							</label>
							<FormatSelect
								id={`convert-to-${key}`}
								value={formatOptions[key].convert_to}
								onValueChange={(val) => handleConvertToChange(key, val)}
								hideFormat={key}
							/>
						</div>
					</div>
				</TabsPanel>
			))}
		</Tabs>
	);
}
