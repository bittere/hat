import { useCallback, useEffect, useState } from "react";
import { toastManager } from "@/components/ui/toast";
import { addWatchedFolder, getWatchedFolders, removeWatchedFolder } from "@/lib/commands";

export function useWatchedFolders() {
	const [watchedFolders, setWatchedFolders] = useState<string[]>([]);

	const refreshFolders = useCallback(async () => {
		try {
			const folders = await getWatchedFolders();
			setWatchedFolders(folders);
		} catch (err) {
			console.error("Failed to load watched folders", err);
		}
	}, []);

	useEffect(() => {
		refreshFolders();
	}, [refreshFolders]);

	const addFolder = useCallback(async (path: string) => {
		if (!path) return;
		try {
			const folders = await addWatchedFolder(path);
			setWatchedFolders(folders);
		} catch (err) {
			console.error("Failed to add folder", err);
			toastManager.add({
				title: "Failed to add folder",
				description: String(err),
				type: "error",
			});
		}
	}, []);

	const removeFolder = useCallback(async (path: string) => {
		try {
			const folders = await removeWatchedFolder(path);
			setWatchedFolders(folders);
		} catch (err) {
			console.error("Failed to remove folder", err);
			toastManager.add({
				title: "Failed to remove folder",
				description: String(err),
				type: "error",
			});
		}
	}, []);

	return {
		watchedFolders,
		addFolder,
		removeFolder,
		refreshFolders,
	};
}
