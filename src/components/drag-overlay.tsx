import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FolderWithFilesLinear, FileSendLinear } from "@solar-icons/react-perf";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "tiff"]);

function getExt(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function DragOverlay() {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("");
  const [isFolder, setIsFolder] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let cancelled = false;

    const setup = async () => {
      const unlisten = await appWindow.onDragDropEvent((event) => {
        if (cancelled) return;
        const payload = event.payload;

        if (payload.type === "enter") {
          const logical = payload.position.toLogical(window.devicePixelRatio);
          posRef.current = { x: logical.x, y: logical.y };

          const first = payload.paths[0] ?? "";
          const name = first.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
          const ext = getExt(name);
          const hasExt = ext !== "";
          setIsFolder(!hasExt);

          if (payload.paths.length > 1) {
            setLabel(`${payload.paths.length} items`);
            setPreviewSrc(null);
          } else {
            setLabel(name);
            if (IMAGE_EXTS.has(ext)) {
              setPreviewSrc(convertFileSrc(first));
            } else {
              setPreviewSrc(null);
            }
          }

          if (elRef.current) {
            elRef.current.style.left = `${logical.x}px`;
            elRef.current.style.top = `${logical.y}px`;
          }
          setVisible(true);
        } else if (payload.type === "over") {
          const logical = payload.position.toLogical(window.devicePixelRatio);
          posRef.current = { x: logical.x, y: logical.y };
          if (elRef.current) {
            elRef.current.style.left = `${logical.x}px`;
            elRef.current.style.top = `${logical.y}px`;
          }
        } else {
          setVisible(false);
          setPreviewSrc(null);
        }
      });

      return unlisten;
    };

    let unlisten: (() => void) | undefined;
    setup().then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (!visible) return null;

  const Icon = isFolder ? FolderWithFilesLinear : FileSendLinear;

  return (
    <div
      ref={elRef}
      className="fixed z-9999 pointer-events-none"
      style={{
        left: posRef.current.x,
        top: posRef.current.y,
      }}
    >
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg -translate-x-1/2 -translate-y-full -mt-3">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt=""
            className="max-w-32 max-h-32 rounded-md"
          />
        ) : (
          <Icon className="size-10" />
        )}
        <span className="text-xs font-medium max-w-[180px] truncate">{label}</span>
      </div>
    </div>
  );
}
