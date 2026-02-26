import { FileSendLinear, FolderWithFilesLinear } from "@solar-icons/react-perf";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tiff"]);

function getExt(name: string) {
	const dot = name.lastIndexOf(".");
	return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function DragOverlay() {
	const [visible, setVisible] = useState(false);
	const [label, setLabel] = useState("");
	const [isFolder, setIsFolder] = useState(false);
	const [previewSrc, setPreviewSrc] = useState<string | null>(null);
	const [unsupported, setUnsupported] = useState(false);
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
					const name =
						first
							.replace(/[\\/]+$/, "")
							.split(/[\\/]/)
							.pop() ?? "";
					const ext = getExt(name);
					const hasExt = ext !== "";
					setIsFolder(!hasExt);

					const isUnsupported = hasExt && !IMAGE_EXTS.has(ext);
					setUnsupported(isUnsupported);

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
						elRef.current.style.transform = `translate(${logical.x}px, ${logical.y}px)`;
					}
					setVisible(true);
				} else if (payload.type === "over") {
					const logical = payload.position.toLogical(window.devicePixelRatio);
					posRef.current = { x: logical.x, y: logical.y };
					if (elRef.current) {
						elRef.current.style.transform = `translate(${logical.x}px, ${logical.y}px)`;
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
			className="pointer-events-none fixed top-0 left-0 z-9999"
			style={{
				transform: `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
			}}
		>
			<div className="-mt-3 -translate-x-1/2 -translate-y-full">
				<div
					className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-4 py-3 shadow-lg ${
						unsupported
							? "border-destructive bg-card text-destructive-foreground"
							: "border-border bg-card text-card-foreground"
					}`}
				>
					{previewSrc ? (
						<img src={previewSrc} alt="" className="max-h-32 max-w-32 rounded-md" />
					) : (
						<Icon className="size-10" />
					)}
					<span className="max-w-[180px] truncate font-medium text-xs">{label}</span>
					{unsupported && (
						<span className="font-medium text-xs">This file type is unsupported</span>
					)}
				</div>
			</div>
		</div>
	);
}
