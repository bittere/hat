import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

interface NewFile {
  path: string;
}

export function useDownloadsWatcher(onNewFile: (path: string) => void) {
  useEffect(() => {
    const unlisten = listen<NewFile>("new-download", (event) => {
      onNewFile(event.payload.path);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onNewFile]);
}
