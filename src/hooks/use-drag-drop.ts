import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface DragItem {
  name: string;
  isFolder: boolean;
  path: string;
}

export function useDragDrop(onDrop?: (paths: string[]) => void) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragItems, setDragItems] = useState<DragItem[]>([]);

  useEffect(() => {
    const unlistenEnter = getCurrentWindow().listen<{ paths: string[] }>(
      "tauri://drag-enter",
      ({ payload }) => {
        setIsDragOver(true);
        // We can't easily know if they are folders/files from just paths here
        // without FS calls, but for the UI preview we'll treat them as items.
        setDragItems(
          payload.paths.map((p) => ({
            path: p,
            name: p.split(/[/\\]/).pop() || p,
            isFolder: false, // Default to false, can be refined if needed
          }))
        );
      }
    );

    const unlistenDrop = getCurrentWindow().listen<{ paths: string[] }>(
      "tauri://drag-drop",
      ({ payload }) => {
        setIsDragOver(false);
        setDragItems([]);
        if (onDrop) {
          onDrop(payload.paths);
        }
      }
    );

    const unlistenLeave = getCurrentWindow().listen(
      "tauri://drag-leave",
      () => {
        setIsDragOver(false);
        setDragItems([]);
      }
    );

    return () => {
      unlistenEnter.then((u) => u());
      unlistenDrop.then((u) => u());
      unlistenLeave.then((u) => u());
    };
  }, [onDrop]);

  return { isDragOver, dragItems };
}
