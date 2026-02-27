import { FileSendLinear } from "@solar-icons/react-perf";
import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { DragOverlay } from "@/components/drag-overlay";
import { Dropzone } from "@/components/dropzone";
import { HistoryFilters } from "@/components/history-filters";
import { HistoryList } from "@/components/history-list";
import { SettingsDialog } from "@/components/settings-dialog";
import { StatisticsCard } from "@/components/statistics-card";
import { TitleBar } from "@/components/title-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import { toastManager } from "@/components/ui/toast";
import { useCompressionEvents } from "@/hooks/use-compression-events";
import { useDownloadsWatcher } from "@/hooks/use-downloads-watcher";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { useFilteredHistory } from "@/hooks/use-filtered-history";
import { extractFileName } from "@/lib/format";
import "./App.css";

function App() {
	const {
		history,
		recompressed,
		handleRecompress,
		handleConvert,
		handleClearHistory,
		handleManualCompress,
	} = useCompressionEvents();

	const settingsOpen = useRef(false);
	const [search, setSearch] = useState("");
	const [filterDate, setFilterDate] = useState<DateRange | undefined>();

	const { historyGroups, filteredHistory } = useFilteredHistory(history, search, filterDate);

	const handleManualDrop = useCallback(
		(paths: string[]) => {
			if (!settingsOpen.current) {
				handleManualCompress(paths);
			}
		},
		[handleManualCompress]
	);

	const { isDragOver, dragItems } = useDragDrop(handleManualDrop);

	const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tiff"]);
	const hasNonImage =
		dragItems.length > 0 &&
		dragItems.some((item) => {
			const dot = item.name.lastIndexOf(".");
			const ext = dot >= 0 ? item.name.slice(dot + 1).toLowerCase() : "";
			return !IMAGE_EXTS.has(ext);
		});

	const showDropZone = isDragOver && !settingsOpen.current && !hasNonImage;

	const handleNewDownload = useCallback((path: string) => {
		const fileName = extractFileName(path);
		toastManager.add({
			title: "New download",
			description: fileName,
			type: "info",
		});
	}, []);

	useDownloadsWatcher(handleNewDownload);

	return (
		<main className="relative flex h-screen flex-col">
			<TitleBar>
				<SettingsDialog
					onOpenChange={(open) => {
						settingsOpen.current = open;
					}}
				/>
			</TitleBar>
			<DragOverlay />
			<Dialog open={showDropZone}>
				<DialogPopup showCloseButton={false}>
					<Dropzone
						icon={<FileSendLinear className="size-10" />}
						isDragOver
						className="m-1 flex-1 rounded-[calc(var(--radius-2xl)-1px)] py-16 font-medium"
					>
						Drop images here to compress
					</Dropzone>
				</DialogPopup>
			</Dialog>

			<div className="flex min-h-0 flex-1 gap-4 p-4">
				<div className="flex w-80 shrink-0 flex-col gap-3">
					<StatisticsCard history={history} />

					<div className="mt-auto flex flex-col gap-2">
						<Button
							variant="outline"
							size="sm"
							className="w-full"
							onClick={() => {
								handleClearHistory();
								setSearch("");
								setFilterDate(undefined);
							}}
							disabled={history.length === 0}
						>
							Clear History
						</Button>
					</div>
				</div>

				{/* Right column – History */}
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<HistoryFilters
						search={search}
						onSearchChange={setSearch}
						filterDate={filterDate}
						onFilterDateChange={setFilterDate}
						onClear={() => {
							setFilterDate(undefined);
							setSearch("");
						}}
					/>
					<HistoryList
						historyGroups={historyGroups}
						historyLength={history.length}
						filteredCount={filteredHistory.length}
						recompressed={recompressed}
						onRecompress={handleRecompress}
						onConvert={handleConvert}
						onClearFilters={() => {
							setFilterDate(undefined);
							setSearch("");
						}}
					/>
				</div>
			</div>
		</main>
	);
}

export default App;
