import {
	AltArrowDownLinear,
	FolderOpenLinear,
	ForbiddenCircleLinear,
} from "@solar-icons/react-perf";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Dialog,
	DialogFooter,
	DialogHeader,
	DialogPopup,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractFileName, formatBytes } from "@/lib/format";
import type { CompressionRecord } from "@/lib/types";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tiff"]);

function getExt(path: string) {
	const dot = path.lastIndexOf(".");
	return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

interface HistoryGroup {
	label: string;
	count: number;
	saved: number;
	items: CompressionRecord[];
}

function groupByDate(history: CompressionRecord[]): HistoryGroup[] {
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(today.getDate() - 1);

	const todayStr = today.toDateString();
	const yesterdayStr = yesterday.toDateString();

	const groups: HistoryGroup[] = [];

	for (let i = history.length - 1; i >= 0; i--) {
		const record = history[i];
		if (record.status === "failed") continue;

		const date = new Date(record.timestamp * 1000);
		const dateStr = date.toDateString();

		const label =
			dateStr === todayStr
				? "Today"
				: dateStr === yesterdayStr
					? "Yesterday"
					: date.toLocaleDateString(undefined, {
							month: "short",
							day: "numeric",
						});

		const saved = record.status === "completed" ? record.initial_size - record.compressed_size : 0;

		const last = groups[groups.length - 1];
		if (last && last.label === label) {
			last.count++;
			last.saved += saved;
			last.items.push(record);
		} else {
			groups.push({ label, count: 1, saved, items: [record] });
		}
	}

	return groups;
}

export function SidebarHistory({ history }: { history: CompressionRecord[] }) {
	const groups = useMemo(() => groupByDate(history), [history]);

	if (groups.length === 0) {
		return <p className="text-muted-foreground text-sm">No compressions yet.</p>;
	}

	return (
		<ScrollArea className="flex-1">
			<div className="relative">
				{/* Vertical timeline line */}
				<div className="absolute top-1 bottom-1 left-[3.5px] w-px bg-border" />

				<div className="flex flex-col gap-8">
					{groups.map((group) => (
						<HistoryGroupEntry key={group.label} group={group} />
					))}
				</div>
			</div>
		</ScrollArea>
	);
}

function HistoryGroupEntry({ group }: { group: HistoryGroup }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="flex items-start gap-4">
			{/* Timeline dot */}
			<div className="relative z-10 mt-1 size-2 shrink-0 rounded-full bg-muted-foreground" />

			{/* Content */}
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="font-medium text-muted-foreground text-xs">{group.label}</span>

				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger className="flex w-full items-center justify-between gap-2">
						<span className="text-foreground text-sm">
							Compressed <span className="font-bold">{group.count}</span>{" "}
							{group.count === 1 ? "image" : "images"}
						</span>
						<AltArrowDownLinear
							className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
						/>
					</CollapsibleTrigger>

					<CollapsiblePanel>
						<div className="mt-1.5 flex flex-wrap gap-1">
							<TooltipProvider>
								{group.items.map((item) => (
									<ThumbnailBox key={item.timestamp} item={item} />
								))}
							</TooltipProvider>
						</div>
					</CollapsiblePanel>
				</Collapsible>

				<span className="text-muted-foreground text-xs">
					Saved{" "}
					<span className="font-bold text-foreground">{formatBytes(Math.max(0, group.saved))}</span>{" "}
					of space
				</span>
			</div>
		</div>
	);
}

function ThumbnailBox({ item }: { item: CompressionRecord }) {
	const fileName = extractFileName(item.initial_path);
	const ext = getExt(item.initial_path);
	const canPreview = IMAGE_EXTS.has(ext);
	const [failed, setFailed] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);

	const showPlaceholder = !canPreview || failed;

	return (
		<>
			<Tooltip>
				<TooltipTrigger
					render={
						showPlaceholder ? (
							<div
								title={fileName}
								className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted"
							>
								<ForbiddenCircleLinear className="size-3.5 text-muted-foreground" />
							</div>
						) : (
							<img
								src={convertFileSrc(item.initial_path)}
								alt={fileName}
								onError={() => setFailed(true)}
								onClick={() => setPreviewOpen(true)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										setPreviewOpen(true);
									}
								}}
								className="size-6 shrink-0 cursor-pointer rounded-md object-cover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
							/>
						)
					}
				/>
				<TooltipPopup side="top" sideOffset={6}>
					{fileName}
				</TooltipPopup>
			</Tooltip>

			{!showPlaceholder && (
				<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
					<DialogPopup className="max-w-fit">
						<DialogHeader>
							<DialogTitle className="truncate text-base">{fileName}</DialogTitle>
						</DialogHeader>
						<div className="flex justify-center px-6 pb-6">
							<img
								src={convertFileSrc(item.initial_path)}
								alt={fileName}
								className="max-h-[60vh] max-w-[60vw] rounded-lg object-contain"
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => revealItemInDir(item.initial_path)}>
								<FolderOpenLinear />
								Show in Explorer
							</Button>
						</DialogFooter>
					</DialogPopup>
				</Dialog>
			)}
		</>
	);
}
