import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { DragOverlay } from "@/components/drag-overlay";
import { useDownloadsWatcher } from "@/hooks/use-downloads-watcher";
import { useCompressionEvents } from "@/hooks/use-compression-events";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { useFilteredHistory } from "@/hooks/use-filtered-history";
import { StatisticsCard } from "@/components/statistics-card";
import { HistoryFilters } from "@/components/history-filters";
import { HistoryList } from "@/components/history-list";
import { FileSendLinear } from "@solar-icons/react-perf";
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

  const handleManualDrop = useCallback((paths: string[]) => {
    if (!settingsOpen.current) {
      handleManualCompress(paths);
    }
  }, [handleManualCompress]);

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
    <main className="relative flex flex-col h-screen">
      <DragOverlay />
      {showDropZone && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-primary/5 backdrop-blur-sm pointer-events-none border-4 border-dashed border-primary m-2 rounded-2xl animate-in fade-in zoom-in duration-200 text-primary">
          <FileSendLinear className="size-16" />
          <p className="text-sm font-medium">Drop images here to compress</p>
        </div>
      )}
      <header className="flex w-full items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <img src="/app-icon.svg" className="w-6 h-6" alt="Logo" />
          Hat
        </h1>
        <div className="flex items-center gap-1">
          <SettingsDialog onOpenChange={(open) => { settingsOpen.current = open; }} />
        </div>
      </header>
      <div className="flex gap-4 p-4 flex-1 min-h-0">
        <div className="flex flex-col gap-3 w-80 shrink-0">
          <StatisticsCard history={history} />

          <div className="flex flex-col gap-2 mt-auto">
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
        <div className="flex flex-col gap-2 min-w-0 flex-1">
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
