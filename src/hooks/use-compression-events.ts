import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toastManager } from "@/components/ui/toast";
import type { CompressionRecord, CompressionRetry } from "@/lib/types";
import { formatBytes, extractFileName } from "@/lib/format";

export function useCompressionEvents() {
  const [quality, setQuality] = useState(80);
  const [history, setHistory] = useState<CompressionRecord[]>([]);
  const [recompressed, setRecompressed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    invoke<number>("get_quality").then(setQuality);
  }, []);

  useEffect(() => {
    invoke<CompressionRecord[]>("get_compression_history").then(setHistory);
  }, []);

  useEffect(() => {
    const unlisten = listen<CompressionRecord>("compression-complete", (event) => {
      setHistory((prev) => [...prev, event.payload]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<CompressionRetry>("compression-retry", (event) => {
      const { path, attempt, retry_quality, initial_size, compressed_size } = event.payload;
      const fileName = extractFileName(path);
      toastManager.add({
        title: "Recompressing image",
        description: `${fileName} got larger (${formatBytes(initial_size)} → ${formatBytes(compressed_size)}). Retrying at level ${retry_quality} (attempt ${attempt})…`,
        type: "warning",
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleRecompress = useCallback(async (initialPath: string, previousQuality: number, timestamp: number) => {
    setRecompressed((prev) => new Set(prev).add(timestamp));
    try {
      await invoke("recompress", { path: initialPath, previousQuality });
    } catch (e) {
      toastManager.add({
        title: "Recompression failed",
        description: String(e),
        type: "error",
      });
    }
  }, []);

  const handleClearHistory = useCallback(async () => {
    try {
      await invoke("clear_compression_history");
      setHistory([]);
      setRecompressed(new Set());
    } catch (e) {
      toastManager.add({
        title: "Failed to clear history",
        description: String(e),
        type: "error",
      });
    }
  }, []);

  const handleDeleteOriginals = useCallback(async () => {
    try {
      const deleted = await invoke<number>("delete_original_images");
      setHistory((prev) => prev.map((r) => ({ ...r, original_deleted: true })));
      toastManager.add({
        title: "Originals deleted",
        description: `${deleted} original image${deleted === 1 ? "" : "s"} deleted.`,
        type: "info",
      });
    } catch (e) {
      toastManager.add({
        title: "Failed to delete originals",
        description: String(e),
        type: "error",
      });
    }
  }, []);

  const qualityTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const handleQualityChange = useCallback(
    (val: number | readonly number[]) => {
      const v = Array.isArray(val) ? val[0] : val;
      setQuality(v);
      if (qualityTimer.current) clearTimeout(qualityTimer.current);
      qualityTimer.current = setTimeout(() => {
        invoke("set_quality", { value: v });
      }, 300);
    },
    [],
  );

  const handleManualCompress = useCallback(async (paths: string[]) => {
    try {
      await invoke("compress_files", { paths });
    } catch (e) {
      toastManager.add({
        title: "Compression failed",
        description: String(e),
        type: "error",
      });
    }
  }, []);

  return {
    quality,
    history,
    recompressed,
    handleRecompress,
    handleClearHistory,
    handleDeleteOriginals,
    handleQualityChange,
    handleManualCompress,
  };
}
