import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvifPanel } from "@/components/format-panels/avif-panel";
import { HeifPanel } from "@/components/format-panels/heif-panel";
import { JpegPanel } from "@/components/format-panels/jpeg-panel";
import { PngPanel } from "@/components/format-panels/png-panel";
import { TiffPanel } from "@/components/format-panels/tiff-panel";
import { WebpPanel } from "@/components/format-panels/webp-panel";
import { FORMAT_LABELS, type FormatKey } from "@/components/format-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import type { FormatOptions } from "@/lib/types";

interface FormatOptionsEditorProps {
	options: FormatOptions;
	onChange: (options: FormatOptions) => void;
	format?: FormatKey;
	onFormatChange?: (format: FormatKey) => void;
}

export function FormatOptionsEditor({
	options,
	onChange,
	format,
	onFormatChange,
}: FormatOptionsEditorProps) {
	const updateOptions = useCallback(
		(updater: (prev: FormatOptions) => FormatOptions) => onChange(updater(options)),
		[onChange, options]
	);

	const handleQualityChange = useCallback(
		(key: FormatKey, value: number) => {
			updateOptions((prev) => ({
				...prev,
				[key]: { ...prev[key], quality: value },
			}));
		},
		[updateOptions]
	);

	const updateField = useCallback(
		<K extends FormatKey>(key: K, field: string, value: unknown) => {
			updateOptions((prev) => ({
				...prev,
				[key]: { ...prev[key], [field]: value },
			}));
		},
		[updateOptions]
	);

	return (
		<Tabs
			className="h-full w-full flex-row"
			defaultValue="jpeg"
			value={format}
			onValueChange={(value) => onFormatChange?.(value as FormatKey)}
			orientation="vertical"
		>
			<div className="border-s">
				<TabsList variant="underline">
					{FORMAT_LABELS.map(({ key, label }) => (
						<TabsTab key={key} value={key}>
							{label}
						</TabsTab>
					))}
				</TabsList>
			</div>

			<TabsPanel value="jpeg" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<JpegPanel
						config={options.jpeg}
						onQualityChange={(val) => handleQualityChange("jpeg", val)}
						onFieldChange={(field, val) => updateField("jpeg", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="png" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<PngPanel
						config={options.png}
						onQualityChange={(val) => handleQualityChange("png", val)}
						onFieldChange={(field, val) => updateField("png", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="webp" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<WebpPanel
						config={options.webp}
						onQualityChange={(val) => handleQualityChange("webp", val)}
						onFieldChange={(field, val) => updateField("webp", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="avif" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<AvifPanel
						config={options.avif}
						onQualityChange={(val) => handleQualityChange("avif", val)}
						onFieldChange={(field, val) => updateField("avif", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="heif" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<HeifPanel
						config={options.heif}
						onQualityChange={(val) => handleQualityChange("heif", val)}
						onFieldChange={(field, val) => updateField("heif", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="tiff" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<TiffPanel
						config={options.tiff}
						onQualityChange={(val) => handleQualityChange("tiff", val)}
						onFieldChange={(field, val) => updateField("tiff", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>
		</Tabs>
	);
}

export function FormatQualitySettings() {
	const [formatOptions, setFormatOptions] = useState<FormatOptions | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		invoke<FormatOptions>("get_format_options").then(setFormatOptions);
	}, []);

	const handleChange = useCallback((updated: FormatOptions) => {
		setFormatOptions(updated);
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => {
			invoke("set_format_options", { options: updated });
		}, 300);
	}, []);

	if (!formatOptions) return null;

	return <FormatOptionsEditor options={formatOptions} onChange={handleChange} />;
}
