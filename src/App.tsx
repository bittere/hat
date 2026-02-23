import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsDialog } from "@/components/settings-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { toastManager } from "@/components/ui/toast";
import { useDownloadsWatcher } from "@/hooks/use-downloads-watcher";
import { useCompressionEvents } from "@/hooks/use-compression-events";
import { StatisticsCard } from "@/components/statistics-card";
import { CompressionHistoryCard } from "@/components/compression-history-card";
import { BillCrossLinear, CalendarAddLinear } from "@solar-icons/react-perf";
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

  const [isHovering, setIsHovering] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState<DateRange | undefined>();
  const [filterMonth, setFilterMonth] = useState(new Date());
  const [filterOpen, setFilterOpen] = useState(false);

  const filteredHistory = useMemo(() => {
    const query = search.toLowerCase();
    return history.filter((record) => {
      if (query && !extractFileName(record.initial_path).toLowerCase().includes(query)) {
        return false;
      }
      if (filterDate?.from) {
        const recordDate = new Date(record.timestamp * 1000);
        recordDate.setHours(0, 0, 0, 0);
        const from = new Date(filterDate.from);
        from.setHours(0, 0, 0, 0);
        const to = filterDate.to ? new Date(filterDate.to) : from;
        to.setHours(0, 0, 0, 0);
        if (recordDate < from || recordDate > to) {
          return false;
        }
      }
      return true;
    });
  }, [history, search, filterDate]);

  useEffect(() => {
    let unlistenDragEnter: () => void;
    let unlistenDragLeave: () => void;
    let unlistenDrop: () => void;

    const setupListeners = async () => {
      const window = getCurrentWindow();

      unlistenDragEnter = await window.listen("tauri://drag-enter", () => {
        setIsHovering(true);
      });

      unlistenDragLeave = await window.listen("tauri://drag-leave", () => {
        setIsHovering(false);
      });

      unlistenDrop = await window.listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        setIsHovering(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          handleManualCompress(paths);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenDragEnter) unlistenDragEnter();
      if (unlistenDragLeave) unlistenDragLeave();
      if (unlistenDrop) unlistenDrop();
    };
  }, [handleManualCompress]);

  const handleNewDownload = useCallback((path: string) => {
    const fileName = extractFileName(path);
    console.log("[downloads-watcher] Showing toast for:", fileName);
    toastManager.add({
      title: "New download",
      description: fileName,
      type: "info",
    });
  }, []);

  useDownloadsWatcher(handleNewDownload);

  return (
    <main className="relative">
      {isHovering && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none border-4 border-dashed border-primary m-2 rounded-2xl animate-in fade-in zoom-in duration-200">
          <div className="text-center">
            <p className="text-2xl font-bold">Drop to Compress</p>
            <p className="text-muted-foreground">Release to start processing</p>
          </div>
        </div>
      )}
      <header className="flex w-full items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <img src="/app-icon.svg" className="w-6 h-6" alt="Logo" />
          Hat
        </h1>
        <div className="flex items-center gap-1">
          <SettingsDialog quality={quality} onQualityChange={handleQualityChange} />
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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium shrink-0">History</h2>
            <Input
              placeholder="Search…"
              size="sm"
              className="max-w-64"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                  />
                }
              >
                <CalendarAddLinear className="size-4" aria-hidden="true" />
                {filterDate?.from ? (
                  filterDate.to
                    ? `${format(filterDate.from, "MMM d")} – ${format(filterDate.to, "MMM d")}`
                    : format(filterDate.from, "MMM d")
                ) : "Date"}
              </PopoverTrigger>
              <PopoverPopup align="end" className="w-auto p-0">
                <div className="flex max-sm:flex-col">
                  <div className="relative py-1 ps-1 max-sm:order-1 max-sm:border-t">
                    <div className="flex h-full flex-col sm:border-e sm:pe-3">
                      {([
                        ["Today", 0, 0],
                        ["Yesterday", -1, -1],
                        ["Last 3 days", -3, 0],
                        ["Last week", -7, 0],
                      ] as const).map(([label, fromOffset, toOffset]) => (
                        <Button
                          key={label}
                          className="w-full justify-start"
                          onClick={() => {
                            const today = new Date();
                            const from = addDays(today, fromOffset);
                            const to = addDays(today, toOffset);
                            setFilterDate({ from, to });
                            setFilterMonth(from);
                            setFilterOpen(false);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Calendar
                    className="max-sm:pb-3 sm:ps-2"
                    mode="range"
                    month={filterMonth}
                    onMonthChange={setFilterMonth}
                    selected={filterDate}
                    onSelect={setFilterDate}
                    disabled={{ after: new Date() }}
                  />
                </div>
              </PopoverPopup>
            </Popover>
            {filterDate?.from && (
              <Button variant="destructive" size="sm" className="shrink-0 text-xs" onClick={() => setFilterDate(undefined)}>
                Clear
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-muted rounded-2xl gap-2 p-8 text-center text-muted-foreground">
              <p className="text-sm">No compressions yet.</p>
              <p className="text-xs max-w-[200px]">Download an image or drop one here to get started.</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <BillCrossLinear className="size-12" />
              <p className="text-sm">No results found.</p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2 pr-3">
                {(() => {
                  const reversed = [...filteredHistory].reverse();
                  const today = new Date();
                  const yesterday = new Date();
                  yesterday.setDate(today.getDate() - 1);

                  const groups: { label: string; items: { record: typeof reversed[0]; index: number }[] }[] = [];
                  reversed.forEach((record, i) => {
                    const date = new Date(record.timestamp * 1000);
                    const isToday = date.toDateString() === today.toDateString();
                    const isYesterday = date.toDateString() === yesterday.toDateString();
                    const dateLabel = isToday
                      ? "Today"
                      : isYesterday
                        ? "Yesterday"
                        : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                    const last = groups[groups.length - 1];
                    if (last && last.label === dateLabel) {
                      last.items.push({ record, index: i });
                    } else {
                      groups.push({ label: dateLabel, items: [{ record, index: i }] });
                    }
                  });

                  return groups.map((group, gi) => (
                    <div key={group.label}>
                      <p className={`text-xs text-muted-foreground font-medium px-1 pb-1${gi > 0 ? " pt-2" : ""}`}>
                        {group.label}
                      </p>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                        {group.items.map(({ record, index }) => {
                          const cannotRecompress =
                            record.original_deleted ||
                            recompressed.has(record.timestamp) ||
                            record.quality >= 100;
                          return (
                            <CompressionHistoryCard
                              key={`${record.timestamp}-${index}`}
                              record={record}
                              cannotRecompress={cannotRecompress}
                              onRecompress={handleRecompress}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </main>
  );
}

export default App;
