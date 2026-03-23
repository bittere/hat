import { PowerLinear, SettingsLinear, SidebarMinimalisticLinear } from "@solar-icons/react-perf";
import { useCallback, useRef, useState } from "react";
import { DragOverlay } from "@/components/drag-overlay";
import { SettingsDialog } from "@/components/settings-dialog";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { useCompressionEvents } from "@/hooks/use-compression-events";
import { useDownloadsWatcher } from "@/hooks/use-downloads-watcher";
import { useWatchedFolders } from "@/hooks/use-watched-folders";
import { quitApp } from "@/lib/commands";
import { extractFileName } from "@/lib/format";
import { cn } from "@/lib/utils";
import "./App.css";

function App() {
	const { history, handleManualCompress } = useCompressionEvents();
	const { watchedFolders, addFolder, removeFolder, resetConfig } = useWatchedFolders();

	const [settingsOpen, setSettingsOpen] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const settingsOpenRef = useRef(false);

	const handleSettingsOpenChange = useCallback((open: boolean) => {
		setSettingsOpen(open);
		settingsOpenRef.current = open;
	}, []);

	const handleManualDrop = useCallback(
		async (paths: string[]) => {
			if (settingsOpenRef.current) {
				for (const path of paths) {
					await addFolder(path);
				}
			} else {
				handleManualCompress(paths);
			}
		},
		[handleManualCompress, addFolder]
	);

	const handleNewDownload = useCallback((path: string) => {
		const fileName = extractFileName(path);
		toastManager.add({
			title: "New download",
			description: fileName,
			type: "info",
		});
	}, []);

	useDownloadsWatcher(handleNewDownload);

	const isCompressing = history.some((r) => r.status === "processing");
	const hasError = history.some((r) => r.status === "failed");

	const status = isCompressing ? "compressing" : hasError ? "error" : "idle";

	return (
		<div className="flex h-screen bg-background text-foreground">
			<DragOverlay onDrop={handleManualDrop} />
			<div className="fixed top-4 left-4 z-50">
				<Button variant="ghost" size="icon-xl" onClick={() => setSidebarOpen(!sidebarOpen)}>
					<SidebarMinimalisticLinear className="size-6" />
				</Button>
			</div>
			<Sidebar open={sidebarOpen} history={history} />
			<main className="relative flex min-w-0 flex-1 items-center justify-center">
				<img src="/app-icon.svg" className="size-48" alt="Hat" />
				<div className="absolute bottom-6 left-6 flex items-center gap-2">
					<div
						className={cn(
							"size-2 rounded-full transition-colors duration-300",
							status === "compressing" && "animate-status-pulse bg-info",
							status === "error" && "bg-destructive",
							status === "idle" && "bg-success"
						)}
					/>
					<span className="font-medium text-muted-foreground/80 text-xs">
						{status === "compressing" && "Compressing..."}
						{status === "error" && "Error!"}
						{status === "idle" && "Watching..."}
					</span>
				</div>
				<div className="absolute right-4 bottom-4 flex items-center gap-1">
					<Button variant="ghost" size="icon-xl" onClick={() => quitApp()}>
						<PowerLinear className="size-6" />
					</Button>
					<Button variant="ghost" size="icon-xl" onClick={() => handleSettingsOpenChange(true)}>
						<SettingsLinear className="size-6" />
					</Button>
				</div>
				<SettingsDialog
					open={settingsOpen}
					onOpenChange={handleSettingsOpenChange}
					watchedFolders={watchedFolders}
					addFolder={addFolder}
					removeFolder={removeFolder}
					onResetConfig={resetConfig}
				/>
			</main>
		</div>
	);
}

export default App;
