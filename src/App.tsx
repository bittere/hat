import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ThemeToggle } from "@/components/theme-toggle";
import { toastManager } from "@/components/ui/toast";
import { useDownloadsWatcher } from "@/hooks/use-downloads-watcher";
import "./App.css";

interface VipsStatus {
  loaded: boolean;
  target: string;
  lib_path: string;
  version: string | null;
  initialized: boolean;
  error: string | null;
}

function App() {
  const [status, setStatus] = useState<VipsStatus | null>(null);

  useEffect(() => {
    invoke<VipsStatus>("get_vips_status").then(setStatus);
  }, []);

  const handleNewDownload = useCallback((path: string) => {
    const fileName = path.split(/[\\/]/).pop() ?? path;
    console.log("[downloads-watcher] Showing toast for:", fileName);
    toastManager.add({
      title: "New download",
      description: fileName,
      type: "info",
    });
  }, []);

  useDownloadsWatcher(handleNewDownload);

  return (
    <main>
      <header className="flex w-full items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">Hat</h1>
        <ThemeToggle />
      </header>
      <div className="p-4 space-y-3">
        <h2 className="text-base font-medium">libvips Status</h2>
        {!status ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target</span>
              <span className="font-mono">{status.target}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Library path</span>
              <span className="font-mono text-xs max-w-[60%] truncate" title={status.lib_path}>
                {status.lib_path}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loaded</span>
              <span>{status.loaded ? "✓" : "✗"}</span>
            </div>
            {status.version && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">{status.version}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Initialized</span>
              <span>{status.initialized ? "✓" : "✗"}</span>
            </div>
            {status.error && (
              <p className="text-destructive-foreground text-xs mt-2">{status.error}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
