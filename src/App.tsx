import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeToggle } from "@/components/theme-toggle";
import { Slider, SliderValue } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { useDownloadsWatcher } from "@/hooks/use-downloads-watcher";
import { useCompressionEvents } from "@/hooks/use-compression-events";
import { StatisticsCard } from "@/components/statistics-card";
import { CompressionHistoryCard } from "@/components/compression-history-card";
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
          <img src="app-icon.svg" className="w-6 h-6" alt="Logo" />
          Hat
        </h1>
        <ThemeToggle />
      </header>
      <div className="flex gap-4 p-4 h-[calc(100vh-57px)]">
        {/* Left column – Settings & Statistics */}
        <div className="flex flex-col gap-3 w-80 shrink-0">
          <Slider
            min={1}
            max={100}
            value={quality}
            onValueChange={handleQualityChange}
            className="space-y-2 bg-card p-4 rounded-xl border border-border shadow-xs"
          >
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Compression Level</label>
              <SliderValue className="text-sm tabular-nums text-muted-foreground" />
            </div>
          </Slider>
          <p className="text-xs text-muted-foreground px-1">
            Higher = more compression, smaller files. Lower = less compression, larger files.
          </p>

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

        {/* Right column – Compression History */}
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Compression History</h2>
          </div>
          {history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-muted rounded-2xl gap-2 p-8 text-center text-muted-foreground">
              <p className="text-sm">No compressions yet.</p>
              <p className="text-xs max-w-[200px]">Download an image or drop one here to get started.</p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-1 gap-2 pr-3">
                {[...history].reverse().map((record, i) => {
                  const cannotRecompress =
                    record.original_deleted ||
                    recompressed.has(record.timestamp) ||
                    record.quality >= 100;
                  return (
                    <CompressionHistoryCard
                      key={`${record.timestamp}-${i}`}
                      record={record}
                      cannotRecompress={cannotRecompress}
                      onRecompress={handleRecompress}
                    />
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </main>
  );
}

export default App;
