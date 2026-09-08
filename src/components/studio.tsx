import { convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormatOptionsEditor } from "@/components/format-quality-settings";
import type { FormatKey } from "@/components/format-select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { cleanupStudioPreview, getFormatOptions, processStudioImage } from "@/lib/commands";
import { extractFileName, formatBytes } from "@/lib/format";
import type { FormatOptions, StudioOutput } from "@/lib/types";

const EXTENSION_FORMATS: Record<string, FormatKey> = {
	jpg: "jpeg",
	jpeg: "jpeg",
	png: "png",
	webp: "webp",
	avif: "avif",
	heic: "heif",
	heif: "heif",
	tif: "tiff",
	tiff: "tiff",
};

const OUTPUT_EXTENSIONS: Record<FormatKey, string> = {
	jpeg: "jpg",
	png: "png",
	webp: "webp",
	avif: "avif",
	heif: "heic",
	tiff: "tiff",
};

function formatFromPath(path: string) {
	return EXTENSION_FORMATS[path.split(".").pop()?.toLowerCase() ?? ""];
}

interface StudioProps {
	imagePath: string | null;
	onImagePathChange: (path: string | null) => void;
}

export function Studio({ imagePath, onImagePathChange }: StudioProps) {
	const [options, setOptions] = useState<FormatOptions | null>(null);
	const [targetFormat, setTargetFormat] = useState<FormatKey>("jpeg");
	const [output, setOutput] = useState<StudioOutput | null>(null);
	const [comparison, setComparison] = useState(50);
	const [processing, setProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const requestId = useRef(0);
	const previewPath = useRef<string | null>(null);

	useEffect(() => {
		getFormatOptions().then(setOptions);
	}, []);

	useEffect(() => {
		if (!imagePath) return;
		const sourceFormat = formatFromPath(imagePath);
		if (sourceFormat) setTargetFormat(sourceFormat);
	}, [imagePath]);

	useEffect(() => {
		if (!imagePath || !options) return;
		const currentRequest = ++requestId.current;
		setProcessing(true);
		setError(null);
		const timer = setTimeout(async () => {
			try {
				const result = await processStudioImage(imagePath, targetFormat, options);
				if (currentRequest !== requestId.current) {
					await cleanupStudioPreview(result.path);
					return;
				}
				const previousPath = previewPath.current;
				previewPath.current = result.path;
				setOutput(result);
				if (previousPath) await cleanupStudioPreview(previousPath);
			} catch (previewError) {
				if (currentRequest === requestId.current) {
					setError(String(previewError));
					setOutput(null);
				}
			} finally {
				if (currentRequest === requestId.current) setProcessing(false);
			}
		}, 250);

		return () => clearTimeout(timer);
	}, [imagePath, options, targetFormat]);

	useEffect(
		() => () => {
			if (previewPath.current) cleanupStudioPreview(previewPath.current);
		},
		[]
	);

	const pickImage = useCallback(async () => {
		const selected = await open({
			multiple: false,
			filters: [
				{
					name: "Images",
					extensions: Object.keys(EXTENSION_FORMATS),
				},
			],
		});
		if (selected) onImagePathChange(selected);
	}, [onImagePathChange]);

	const saveToPath = useCallback(
		async (outputPath: string) => {
			if (!imagePath || !options) return;
			try {
				await processStudioImage(imagePath, targetFormat, options, outputPath);
				toastManager.add({ title: "Image saved", description: outputPath, type: "success" });
			} catch (saveError) {
				toastManager.add({
					title: "Could not save image",
					description: String(saveError),
					type: "error",
				});
			}
		},
		[imagePath, options, targetFormat]
	);

	const saveAs = useCallback(async () => {
		if (!imagePath || !options) return;
		const extension = OUTPUT_EXTENSIONS[targetFormat];
		const sourceName = extractFileName(imagePath).replace(/\.[^.]+$/, "");
		const outputPath = await save({
			defaultPath: `${sourceName}_compressed.${extension}`,
			filters: [{ name: targetFormat.toUpperCase(), extensions: [extension] }],
		});
		if (!outputPath) return;
		await saveToPath(outputPath);
	}, [imagePath, options, saveToPath, targetFormat]);

	const saveNearby = useCallback(async () => {
		if (!imagePath) return;
		const extension = OUTPUT_EXTENSIONS[targetFormat];
		const outputPath = imagePath.replace(/\.[^.]+$/, `_compressed.${extension}`);
		await saveToPath(outputPath);
	}, [imagePath, saveToPath, targetFormat]);

	if (!imagePath) {
		return (
			<div className="flex h-full flex-1 items-center justify-center p-12">
				<button type="button" aria-label="Choose image" onClick={pickImage}>
					<img src="/app-icon.svg" className="size-48" alt="Hat" />
				</button>
			</div>
		);
	}

	return (
		<div className="grid h-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] overflow-hidden rounded-2xl max-[800px]:grid-cols-1 max-[800px]:grid-rows-2">
			<section className="flex min-h-0 min-w-0 flex-col gap-4 p-6 max-[800px]:gap-3 max-[800px]:p-4">
				<div className="flex items-center justify-between gap-4 max-[800px]:pr-8">
					<div className="min-w-0">
						<h1 className="truncate font-semibold text-lg">{extractFileName(imagePath)}</h1>
						<p className="text-muted-foreground text-xs">Drag the divider to compare</p>
					</div>
					<Button variant="outline" size="sm" onClick={pickImage}>
						Choose another
					</Button>
				</div>

				<div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted">
					{output && (
						<img
							src={convertFileSrc(output.path)}
							alt="Compressed preview"
							className="absolute inset-0 size-full object-contain"
						/>
					)}
					<img
						src={convertFileSrc(imagePath)}
						alt="Original"
						className="absolute inset-0 size-full object-contain"
						style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }}
					/>
					<div
						className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-md"
						style={{ left: `${comparison}%` }}
					>
						<div className="-translate-1/2 absolute top-1/2 left-1/2 flex size-8 items-center justify-center rounded-full bg-white font-bold text-neutral-700 shadow">
							↔
						</div>
					</div>
					<input
						type="range"
						aria-label="Before and after comparison"
						min={0}
						max={100}
						value={comparison}
						onChange={(event) => setComparison(Number(event.target.value))}
						className="absolute inset-0 size-full cursor-ew-resize opacity-0"
					/>
					<div className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/60 px-2 py-1 text-white text-xs">
						Original
					</div>
					<div className="pointer-events-none absolute top-3 right-3 rounded-md bg-black/60 px-2 py-1 text-white text-xs">
						Compressed
					</div>
					{processing && (
						<div className="absolute inset-0 flex items-center justify-center bg-background/30">
							<Spinner className="size-6" />
						</div>
					)}
				</div>

				<div className="flex min-h-8 items-center justify-between text-sm">
					{error ? (
						<span className="truncate text-destructive">{error}</span>
					) : output ? (
						<span className="text-muted-foreground">
							{formatBytes(output.initial_size)} → {formatBytes(output.output_size)} ·{" "}
							{Math.round((1 - output.output_size / output.initial_size) * 100)}% smaller
						</span>
					) : (
						<span />
					)}
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={saveAs} disabled={!output || processing}>
							Save as…
						</Button>
						<Button onClick={saveNearby} disabled={!output || processing}>
							Save nearby
						</Button>
					</div>
				</div>
			</section>

			<aside className="min-h-0 overflow-hidden border-l bg-card pt-6 max-[800px]:border-t max-[800px]:border-l-0 max-[800px]:pt-4">
				<div className="border-b px-5 pb-4">
					<h2 className="font-semibold">Compression</h2>
					<p className="text-muted-foreground text-xs">Changes update the preview only.</p>
				</div>
				<div className="h-[calc(100%-61px)] py-4 pl-4">
					{options && (
						<FormatOptionsEditor
							options={options}
							onChange={setOptions}
							format={targetFormat}
							onFormatChange={setTargetFormat}
						/>
					)}
				</div>
			</aside>
		</div>
	);
}
