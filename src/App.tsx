import { FileSendLinear } from "@solar-icons/react-perf";
import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { DragOverlay } from "@/components/drag-overlay";
import { HistoryFilters } from "@/components/history-filters";
import { HistoryList } from "@/components/history-list";
import { SettingsDialog } from "@/components/settings-dialog";
import { StatisticsCard } from "@/components/statistics-card";
import { Button } from "@/components/ui/button";
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
		handleClearHistory,
		handleDeleteOriginals,
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

	const { isDragOver } = useDragDrop(handleManualDrop);

	const showDropZone = isDragOver && !settingsOpen.current;

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
			<DragOverlay />
			{showDropZone && (
				<div className="fade-in zoom-in pointer-events-none absolute inset-0 z-50 m-2 flex animate-in flex-col items-center justify-center gap-3 rounded-2xl border-4 border-primary border-dashed bg-primary/5 text-primary backdrop-blur-sm duration-200">
					<FileSendLinear className="size-16" />
					<p className="font-medium text-sm">Drop images here to compress</p>
				</div>
			)}
			<header className="flex w-full shrink-0 items-center justify-between border-border border-b px-4 py-3">
				<h1 className="flex items-center gap-2 font-semibold text-lg">
					<img src="/app-icon.svg" className="h-6 w-6" alt="Logo" />
					Hat
				</h1>
				<div className="flex items-center gap-1">
					<SettingsDialog
						onOpenChange={(open) => {
							settingsOpen.current = open;
						}}
					/>
				</div>
			</header>
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
						<Button
							variant="destructive-outline"
							size="sm"
							className="w-full"
							onClick={handleDeleteOriginals}
							disabled={history.length === 0}
						>
							Delete Originals
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
					/>
				</div>
			</div>
		</main>
	);
}

export default App;
