import { AddFolderLinear, AltArrowDownLinear } from "@solar-icons/react-perf";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openFolderPicker } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { ConversionSettings } from "@/components/conversion-settings";
import { Dropzone } from "@/components/dropzone";
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
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

export interface SettingsContentProps {
	watchedFolders: string[];
	addFolder: (path: string) => Promise<void>;
	removeFolder: (path: string) => Promise<void>;
	activeTab?: string;
	onActiveTabChange?: (tab: string) => void;
	isDragOver?: boolean;
	showFolders?: boolean;
}

const themeItems = [
	{ label: "System", value: "system" },
	{ label: "Light", value: "light" },
	{ label: "Dark", value: "dark" },
] as const;

export function SettingsContent({
	watchedFolders,
	addFolder,
	removeFolder,
	activeTab: activeTabProp,
	onActiveTabChange,
	isDragOver = false,
	showFolders = true,
}: SettingsContentProps) {
	const [searchValue, setSearchValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [searchResults, setSearchResults] = useState<string[]>([]);
	const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
	const [isFocused, setIsFocused] = useState(false);
	const [showBackgroundNotification, setShowBackgroundNotification] = useState(true);
	const [showSystemNotifications, setShowSystemNotifications] = useState(true);
	const [autostart, setAutostart] = useState(false);
	const [internalTab, setInternalTab] = useState("compression");
	const { theme, setTheme } = useTheme();

	const activeTab = activeTabProp ?? internalTab;
	const setActiveTab = onActiveTabChange ?? setInternalTab;

	useEffect(() => {
		invoke<boolean>("get_show_background_notification").then(setShowBackgroundNotification);
		invoke<boolean>("get_show_system_notifications").then(setShowSystemNotifications);
		isEnabled().then(setAutostart);
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

	const handleAddFolder = useCallback(
		async (path: string) => {
			await addFolder(path);
			setSearchValue("");
		},
		[addFolder]
	);

	const handleBrowseFolders = useCallback(async () => {
		try {
			const selected = await openFolderPicker({
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

	const handleToggleAutostart = async (checked: boolean) => {
		try {
			if (checked) {
				await enable();
			} else {
				await disable();
			}
			setAutostart(checked);
		} catch (err) {
			console.error("Failed to update autostart setting", err);
		}
	};

	const selectedTheme = themeItems.find((t) => t.value === theme) ?? themeItems[0];

	return (
		<Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="h-full">
			<div className="border-s">
				<TabsList variant="underline">
					<TabsTab value="compression">Compression</TabsTab>
					<TabsTab value="conversion">Conversion</TabsTab>
					{showFolders && <TabsTab value="folders">Folders</TabsTab>}
					<TabsTab value="appearance">Appearance</TabsTab>
					<TabsTab value="notifications">Notifications</TabsTab>
					<TabsTab value="system">System</TabsTab>
				</TabsList>
			</div>

			{/* Compression Tab */}
			<TabsPanel value="compression">
				<FormatQualitySettings />
			</TabsPanel>

			{/* Conversion Tab */}
			<TabsPanel value="conversion">
				<ConversionSettings />
			</TabsPanel>

			{/* Folders Tab */}
			{showFolders && (
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
								onClick={() => handleAddFolder(searchValue)}
								disabled={!searchValue}
							>
								<AddFolderLinear className="mr-1.5 size-4" />
								Add
							</Button>
						</div>

						<Dropzone
							icon={<AddFolderLinear className="size-6" />}
							isDragOver={isDragOver}
							onClick={handleBrowseFolders}
							className="w-full"
						>
							Drop folders here to watch, or click to browse
						</Dropzone>

						<Collapsible>
							<CollapsibleTrigger className="flex items-center gap-2 text-sm [&_svg]:transition-transform [&_svg]:duration-200 data-panel-open:[&_svg]:rotate-180">
								<span>Currently Watching ({watchedFolders.length})</span>
								<AltArrowDownLinear className="size-4" />
							</CollapsibleTrigger>
							<CollapsibleContent>
								<div className="mt-2 max-h-[150px] select-none overflow-y-auto pr-1">
									<CheckboxGroup value={selectedFolders} className="gap-2">
										<label htmlFor="settings-select-all" className="flex items-center gap-2 pb-2">
											<Checkbox
												id="settings-select-all"
												checked={allSelected}
												indeterminate={someSelected}
												onCheckedChange={toggleSelectAll}
											/>
											<span className="font-medium text-xs">Select All</span>
										</label>
										{watchedFolders.map((folder: string, index: number) => (
											<label
												htmlFor={`settings-folder-${index}`}
												key={folder}
												className="flex items-center gap-2"
												title={folder}
											>
												<Checkbox
													id={`settings-folder-${index}`}
													checked={selectedFolders.includes(folder)}
													onCheckedChange={(checked) => toggleFolder(folder, checked as boolean)}
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
			)}

			{/* Appearance Tab */}
			<TabsPanel value="appearance">
				<div className="space-y-4">
					<div className="flex flex-col items-start gap-1.5">
						<label htmlFor="settings-theme-select" className="font-medium text-foreground text-sm">
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

			{/* System Tab */}
			<TabsPanel value="system">
				<div className="space-y-4">
					<SettingsSwitch
						checked={autostart}
						onCheckedChange={handleToggleAutostart}
						title="Launch at Startup"
						description="Automatically start Hat when you log in to your computer."
					/>
				</div>
			</TabsPanel>
		</Tabs>
	);
}
