import { invoke } from "@tauri-apps/api/core";
import type { CompressionRecord, FormatOptions } from "@/lib/types";

export function getCompressionHistory() {
	return invoke<CompressionRecord[]>("get_compression_history");
}

export function clearCompressionHistory() {
	return invoke<void>("clear_compression_history");
}

export function compressFiles(paths: string[]) {
	return invoke<void>("compress_files", { paths });
}

export function recompress(path: string, previousQuality: number) {
	return invoke<void>("recompress", { path, previousQuality });
}

export function convertImage(path: string, targetFormat: string) {
	return invoke<void>("convert_image", { path, targetFormat });
}

export function checkFileExists(path: string) {
	return invoke<boolean>("check_file_exists", { path });
}

export function getQuality() {
	return invoke<number>("get_quality");
}

export function setQuality(value: number) {
	return invoke<number>("set_quality", { value });
}

export function getShowBackgroundNotification() {
	return invoke<boolean>("get_show_background_notification");
}

export function setShowBackgroundNotification(value: boolean) {
	return invoke<boolean>("set_show_background_notification", { value });
}

export function getShowSystemNotifications() {
	return invoke<boolean>("get_show_system_notifications");
}

export function setShowSystemNotifications(value: boolean) {
	return invoke<boolean>("set_show_system_notifications", { value });
}

export function getFormatOptions() {
	return invoke<FormatOptions>("get_format_options");
}

export function setFormatOptions(options: FormatOptions) {
	return invoke<FormatOptions>("set_format_options", { options });
}

export function getWatchedFolders() {
	return invoke<string[]>("get_watched_folders");
}

export function addWatchedFolder(path: string) {
	return invoke<string[]>("add_watched_folder", { path });
}

export function removeWatchedFolder(path: string) {
	return invoke<string[]>("remove_watched_folder", { path });
}

export function searchDirectories(query: string) {
	return invoke<string[]>("search_directories", { query });
}

export function quitApp() {
	return invoke<void>("quit_app");
}
