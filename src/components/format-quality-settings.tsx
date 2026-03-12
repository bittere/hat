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

	const updateField = useCallback(
		<K extends FormatKey>(key: K, field: string, value: unknown) => {
			updateOptions((prev) => ({
				...prev,
				[key]: { ...prev[key], [field]: value },
			}));
		},
		[updateOptions]
	);

	if (!formatOptions) return null;

	return (
		<Tabs className="h-full w-full flex-row" defaultValue="jpeg" orientation="vertical">
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
						config={formatOptions.jpeg}
						onQualityChange={(val) => handleQualityChange("jpeg", val)}
						onFieldChange={(field, val) => updateField("jpeg", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="png" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<PngPanel
						config={formatOptions.png}
						onQualityChange={(val) => handleQualityChange("png", val)}
						onFieldChange={(field, val) => updateField("png", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="webp" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<WebpPanel
						config={formatOptions.webp}
						onQualityChange={(val) => handleQualityChange("webp", val)}
						onFieldChange={(field, val) => updateField("webp", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="avif" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<AvifPanel
						config={formatOptions.avif}
						onQualityChange={(val) => handleQualityChange("avif", val)}
						onFieldChange={(field, val) => updateField("avif", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="heif" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<HeifPanel
						config={formatOptions.heif}
						onQualityChange={(val) => handleQualityChange("heif", val)}
						onFieldChange={(field, val) => updateField("heif", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>

			<TabsPanel value="tiff" className="overflow-hidden">
				<ScrollArea scrollFade className="h-full">
					<TiffPanel
						config={formatOptions.tiff}
						onQualityChange={(val) => handleQualityChange("tiff", val)}
						onFieldChange={(field, val) => updateField("tiff", field, val)}
					/>
				</ScrollArea>
			</TabsPanel>
		</Tabs>
	);
}
