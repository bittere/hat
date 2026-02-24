import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { extractFileName } from "@/lib/format";
import "./App.css";

function App() {
  const {
    quality,
    history,
    recompressed,
    handleRecompress,
    handleClearHistory,
    handleDeleteOriginals,
    handleQualityChange,
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

  useDragDrop(handleManualDrop);

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
    <main className="relative">
      <DragOverlay />
      <header className="flex w-full items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <img src="/app-icon.svg" className="w-6 h-6" alt="Logo" />
          Hat
        </h1>
        <div className="flex items-center gap-1">
          <SettingsDialog quality={quality} onQualityChange={handleQualityChange} onOpenChange={(open) => { settingsOpen.current = open; }} />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex gap-4 p-4 h-[calc(100vh-57px)]">
        {/* Left column – Settings & Statistics */}
        <div className="flex flex-col gap-3 w-80 shrink-0">
          <StatisticsCard history={history} />

          <div className="flex flex-col gap-2 mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleClearHistory}
              disabled={history.length === 0}
            >
              Clear History
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              className="w-full opacity-80 hover:opacity-100"
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
