import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { toastManager } from "@/components/ui/toast";
import { extractFileName, formatBytes } from "@/lib/format";
import type {
	CompressionFailed,
	CompressionRecord,
	CompressionRetry,
	CompressionStarted,
} from "@/lib/types";

export function useCompressionEvents() {
	const [history, setHistory] = useState<CompressionRecord[]>([]);
	const [recompressed, setRecompressed] = useState<Set<number>>(() => new Set());

	useEffect(() => {
		invoke<CompressionRecord[]>("get_compression_history").then((records) => {
			setHistory(records.map((r) => ({ ...r, status: "completed" })));
		});
	}, []);

	useEffect(() => {
		const unlistenStarted = listen<CompressionStarted>("compression-started", (event) => {
			const { initial_path, timestamp } = event.payload;
			setHistory((prev) => {
				// Prevent double entries (same timestamp OR same path still processing)
				if (prev.some((r) => r.timestamp === timestamp)) return prev;
				if (prev.some((r) => r.initial_path === initial_path && r.status === "processing"))
					return prev;

				const newRecord: CompressionRecord = {
					initial_path,
					final_path: "",
					initial_size: 0,
					compressed_size: 0,
					initial_format: "",
					final_format: "",
					quality: 0,
					timestamp,
					original_deleted: false,
					status: "processing",
				};
				return [...prev, newRecord];
			});
		});

		const unlistenComplete = listen<CompressionRecord>("compression-complete", (event) => {
			setHistory((prev) => {
				const index = prev.findIndex((r) => r.timestamp === event.payload.timestamp);
				if (index > -1) {
					const newHistory = [...prev];
					newHistory[index] = { ...event.payload, status: "completed" };
					return newHistory;
				}
				return [...prev, { ...event.payload, status: "completed" }];
			});
		});

		const unlistenFailed = listen<CompressionFailed>("compression-failed", (event) => {
			setHistory((prev) => {
				const index = prev.findIndex((r) => r.timestamp === event.payload.timestamp);
				if (index > -1) {
					const newHistory = [...prev];
					newHistory[index] = { ...newHistory[index], status: "failed" };
					return newHistory;
				}
				// If not found, add it as failed
				const newRecord: CompressionRecord = {
					initial_path: event.payload.initial_path,
					final_path: "",
					initial_size: 0,
					compressed_size: 0,
					initial_format: "",
					final_format: "",
					quality: 0,
					timestamp: event.payload.timestamp,
					original_deleted: false,
					status: "failed",
				};
				return [...prev, newRecord];
			});
		});

		return () => {
			unlistenStarted.then((fn) => fn());
			unlistenComplete.then((fn) => fn());
			unlistenFailed.then((fn) => fn());
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

	const handleRecompress = useCallback(
		async (initialPath: string, previousQuality: number, timestamp: number) => {
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
		},
		[]
	);

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

	const handleConvert = useCallback(
		async (initialPath: string, targetFormat: string, timestamp: number) => {
			setRecompressed((prev) => new Set(prev).add(timestamp));
			try {
				await invoke("convert_image", { path: initialPath, targetFormat });
			} catch (e) {
				toastManager.add({
					title: "Conversion failed",
					description: String(e),
					type: "error",
				});
			}
		},
		[]
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
		history,
		recompressed,
		handleRecompress,
		handleConvert,
		handleClearHistory,
		handleManualCompress,
	};
}
