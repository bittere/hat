import { AddFolderLinear, AltArrowDownLinear, Tuning2Linear } from "@solar-icons/react-perf";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormatQualitySettings } from "@/components/format-quality-settings";
import { useTheme } from "@/components/theme-provider";
import {
	Autocomplete,
	AutocompleteInput,
	AutocompleteItem,
	AutocompleteList,
	AutocompletePopup,
	AutocompleteStatus,
} from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Dialog,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { toastManager } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";

interface SettingsDialogProps {
	onOpenChange?: (open: boolean) => void;
}

const themeItems = [
	{ label: "System", value: "system" },
	{ label: "Light", value: "light" },
	{ label: "Dark", value: "dark" },
] as const;

export function SettingsDialog({ onOpenChange }: SettingsDialogProps) {
	const [searchValue, setSearchValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [searchResults, setSearchResults] = useState<string[]>([]);
	const [watchedFolders, setWatchedFolders] = useState<string[]>([]);
	const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
	const [isFocused, setIsFocused] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [showBackgroundNotification, setShowBackgroundNotification] = useState(true);
	const [showSystemNotifications, setShowSystemNotifications] = useState(true);
	const dialogOpenRef = useRef(false);
	const { theme, setTheme } = useTheme();

	const handleOpenChange = useCallback(
		(open: boolean) => {
			dialogOpenRef.current = open;
			if (!open) setIsDragOver(false);
			onOpenChange?.(open);
		},
		[onOpenChange]
	);

	useEffect(() => {
		invoke<string[]>("get_watched_folders").then(setWatchedFolders);
		invoke<boolean>("get_show_background_notification").then(setShowBackgroundNotification);
		invoke<boolean>("get_show_system_notifications").then(setShowSystemNotifications);
	}, []);

	const performSearch = useCallback(async (query: string) => {
		setIsLoading(true);
		try {
			const results = await invoke<string[]>("search_directories", { query });
			setSearchResults(results);
		} catch (err) {
			console.error("Failed to search directories", err);
			setSearchResults([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		let ignore = false;
		const timeoutId = setTimeout(async () => {
			if (!ignore) {
				performSearch(searchValue);
			}
		}, 300);

		return () => {
			clearTimeout(timeoutId);
			ignore = true;
		};
	}, [searchValue, performSearch]);

	const addFolder = useCallback(async (path: string) => {
		if (!path) return;
		try {
			const folders = await invoke<string[]>("add_watched_folder", { path });
			setWatchedFolders(folders);
			setSearchValue("");
		} catch (err) {
			console.error("Failed to add folder", err);
			toastManager.add({
				title: "Failed to add folder",
				description: String(err),
				type: "error",
			});
		}
	}, []);

	const handleBrowseFolders = useCallback(async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: true,
				title: "Select folders to watch",
			});

			if (selected && Array.isArray(selected)) {
				for (const path of selected) {
					await addFolder(path);
				}
			} else if (selected && typeof selected === "string") {
				await addFolder(selected);
			}
		} catch (err) {
			console.error("Failed to open folder picker", err);
		}
	}, [addFolder]);

	useEffect(() => {
		const appWindow = getCurrentWindow();
		let unlistenEnter: () => void;
		let unlistenLeave: () => void;
		let unlistenDrop: () => void;

		const setup = async () => {
			unlistenEnter = await appWindow.listen("tauri://drag-enter", () => {
				if (dialogOpenRef.current) {
					setIsDragOver(true);
				}
			});
			unlistenLeave = await appWindow.listen("tauri://drag-leave", () => {
				setIsDragOver(false);
			});
			unlistenDrop = await appWindow.listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
				if (!dialogOpenRef.current) return;
				setIsDragOver(false);

				// The backend add_watched_folder validates that the path is a directory.
				for (const path of event.payload.paths) {
					addFolder(path);
				}
			});
		};

		setup();
		return () => {
			if (unlistenEnter) unlistenEnter();
			if (unlistenLeave) unlistenLeave();
			if (unlistenDrop) unlistenDrop();
		};
	}, [addFolder]);

	const removeFolder = async (path: string) => {
		try {
			const folders = await invoke<string[]>("remove_watched_folder", { path });
			setWatchedFolders(folders);
			setSelectedFolders((prev) => prev.filter((f) => f !== path));
		} catch (err) {
			console.error("Failed to remove folder", err);
			toastManager.add({
				title: "Failed to remove folder",
				description: String(err),
				type: "error",
			});
		}
	};

	const removeSelectedFolders = async () => {
		for (const folder of selectedFolders) {
			await removeFolder(folder);
		}
		setSelectedFolders([]);
	};

	const allSelected = watchedFolders.length > 0 && selectedFolders.length === watchedFolders.length;
	const someSelected = selectedFolders.length > 0 && !allSelected;

	const toggleSelectAll = (checked: boolean) => {
		setSelectedFolders(checked ? [...watchedFolders] : []);
	};

	const toggleFolder = (folder: string, checked: boolean) => {
		setSelectedFolders((prev) => (checked ? [...prev, folder] : prev.filter((f) => f !== folder)));
	};

	const handleToggleBackgroundNotification = async (checked: boolean) => {
		try {
			await invoke("set_show_background_notification", { value: checked });
			setShowBackgroundNotification(checked);
		} catch (err) {
			console.error("Failed to update notification setting", err);
		}
	};

	const handleToggleSystemNotifications = async (checked: boolean) => {
		try {
			await invoke("set_show_system_notifications", { value: checked });
			setShowSystemNotifications(checked);
		} catch (err) {
			console.error("Failed to update system notification setting", err);
		}
	};

	const selectedTheme = themeItems.find((t) => t.value === theme) ?? themeItems[0];

	return (
		<Dialog onOpenChange={handleOpenChange}>
			<DialogTrigger
				render={<Toggle pressed={false} variant="outline" size="sm" aria-label="Settings" />}
			>
				<Tuning2Linear />
			</DialogTrigger>
			<DialogPopup className="h-112 max-w-2xl">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Configure compression and appearance.</DialogDescription>
				</DialogHeader>
				<DialogPanel>
					<Tabs defaultValue="compression" orientation="vertical">
						<div className="border-s">
							<TabsList variant="underline">
								<TabsTab value="compression">Compression</TabsTab>
								<TabsTab value="folders">Folders</TabsTab>
								<TabsTab value="appearance">Appearance</TabsTab>
								<TabsTab value="notifications">Notifications</TabsTab>
							</TabsList>
						</div>

						{/* Compression Tab */}
						<TabsPanel value="compression">
							<FormatQualitySettings />
						</TabsPanel>

						{/* Folders Tab */}
						<TabsPanel value="folders">
							<div className="space-y-3">
								<div className="flex gap-2">
									<div className="flex-1">
										<Autocomplete
											items={searchResults}
											onValueChange={(val) => {
												if (val) setSearchValue(val as string);
											}}
											value={searchValue}
											filter={null}
										>
											<AutocompleteInput
												placeholder="Search or paste folder path..."
												className="text-xs"
												value={searchValue}
												onInput={(e: React.FormEvent<HTMLInputElement>) =>
													setSearchValue(e.currentTarget.value)
												}
												onFocus={() => {
													setIsFocused(true);
													performSearch(searchValue);
												}}
												onBlur={() => setIsFocused(false)}
											/>
											{(searchValue !== "" || isFocused) && (
												<AutocompletePopup aria-busy={isLoading || undefined}>
													<AutocompleteStatus className="text-muted-foreground text-xs">
														{isLoading ? (
															<span className="flex items-center gap-2">
																Searching... <Spinner className="size-3" />
															</span>
														) : (
															`${searchResults.length} results found`
														)}
													</AutocompleteStatus>
													<AutocompleteList>
														{(path: string) => (
															<AutocompleteItem key={path} value={path} className="text-xs">
																{path}
															</AutocompleteItem>
														)}
													</AutocompleteList>
												</AutocompletePopup>
											)}
										</Autocomplete>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => addFolder(searchValue)}
										disabled={!searchValue}
									>
										<AddFolderLinear className="mr-1.5 size-4" />
										Add
									</Button>
								</div>

								<button
									type="button"
									className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary ${
										isDragOver
											? "border-primary bg-primary/5 text-primary"
											: "border-muted-foreground/25 text-muted-foreground"
									}`}
									onClick={handleBrowseFolders}
								>
									<AddFolderLinear className="size-6" />
									<p className="text-xs">Drop folders here to watch, or click to browse</p>
								</button>

								<Collapsible>
									<CollapsibleTrigger className="flex items-center gap-2 text-sm [&_svg]:transition-transform [&_svg]:duration-200 data-panel-open:[&_svg]:rotate-180">
										<span>Currently Watching ({watchedFolders.length})</span>
										<AltArrowDownLinear className="size-4" />
									</CollapsibleTrigger>
									<CollapsibleContent>
										<div className="mt-2 max-h-[150px] select-none overflow-y-auto pr-1">
											<CheckboxGroup value={selectedFolders} className="gap-2">
												<label
													htmlFor="settings-select-all"
													className="flex items-center gap-2 pb-2"
												>
													<Checkbox
														id="settings-select-all"
														checked={allSelected}
														indeterminate={someSelected}
														onCheckedChange={toggleSelectAll}
													/>
													<span className="font-medium text-xs">Select All</span>
												</label>
												{watchedFolders.map((folder, index) => (
													<label
														htmlFor={`settings-folder-${index}`}
														key={folder}
														className="flex items-center gap-2"
														title={folder}
													>
														<Checkbox
															id={`settings-folder-${index}`}
															checked={selectedFolders.includes(folder)}
															onCheckedChange={(checked) =>
																toggleFolder(folder, checked as boolean)
															}
														/>
														<span className="truncate text-sm">{folder}</span>
													</label>
												))}
											</CheckboxGroup>
										</div>
										<Button
											variant="destructive"
											size="xs"
											disabled={selectedFolders.length === 0}
											onClick={removeSelectedFolders}
											className="mt-2"
										>
											Delete Selected ({selectedFolders.length})
										</Button>
									</CollapsibleContent>
								</Collapsible>
							</div>
						</TabsPanel>

						{/* Appearance Tab */}
						<TabsPanel value="appearance">
							<div className="space-y-4">
								<div className="flex flex-col gap-1.5">
									<label
										htmlFor="settings-theme-select"
										className="font-medium text-foreground text-sm"
									>
										Theme
									</label>
									<Select
										id="settings-theme-select"
										value={selectedTheme.value}
										onValueChange={(val) => {
											setTheme(val as "light" | "dark" | "system");
										}}
									>
										<SelectTrigger size="sm" className="w-auto">
											<SelectValue>{selectedTheme.label}</SelectValue>
										</SelectTrigger>
										<SelectPopup>
											{themeItems.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectPopup>
									</Select>
								</div>
							</div>
						</TabsPanel>

						{/* Notifications Tab */}
						<TabsPanel value="notifications">
							<div className="space-y-4">
								<SettingsSwitch
									checked={showBackgroundNotification}
									onCheckedChange={handleToggleBackgroundNotification}
									title="Background Operation Alert"
									description="Show a notification when Hat continues to run in the background after closing the window."
								/>
								<SettingsSwitch
									checked={showSystemNotifications}
									onCheckedChange={handleToggleSystemNotifications}
									title="System Notifications"
									description="Show a system notification when an image is successfully compressed."
								/>
							</div>
						</TabsPanel>
					</Tabs>
				</DialogPanel>
				<DialogFooter>
					<DialogClose
						render={
							<Button variant="ghost" size="sm">
								Close
							</Button>
						}
					/>
				</DialogFooter>
			</DialogPopup>
		</Dialog>
	);
}
