import { useEffect, useRef, useState, useCallback } from "react";
import { Tuning2Linear, AltArrowDownLinear, AddFolderLinear } from "@solar-icons/react-perf";
import { FolderPlus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toggle } from "@/components/ui/toggle";
import { Slider, SliderValue } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  AutocompleteStatus,
} from "@/components/ui/autocomplete";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Spinner } from "@/components/ui/spinner";

interface SettingsDialogProps {
  quality: number;
  onQualityChange: (value: number) => void;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ quality, onQualityChange, onOpenChange }: SettingsDialogProps) {
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [watchedFolders, setWatchedFolders] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dialogOpenRef = useRef(false);

  const handleOpenChange = useCallback((open: boolean) => {
    dialogOpenRef.current = open;
    if (!open) setIsDragOver(false);
    onOpenChange?.(open);
  }, [onOpenChange]);

  useEffect(() => {
    invoke<string[]>("get_watched_folders").then(setWatchedFolders);
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
      unlistenDrop = await appWindow.listen<{ paths: string[] }>(
        "tauri://drag-drop",
        (event) => {
          if (!dialogOpenRef.current) return;
          setIsDragOver(false);

          // Filter out files, only add folders (or files if they are actually images)
          // The backend add_watched_folder handles the directory check.
          for (const path of event.payload.paths) {
            addFolder(path);
          }
        }
      );
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
    setSelectedFolders((prev) =>
      checked ? [...prev, folder] : prev.filter((f) => f !== folder)
    );
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Toggle pressed={false} variant="outline" size="sm" aria-label="Settings" />
        }
      >
        <Tuning2Linear />
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure compression options.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-6">
            <Slider
              min={1}
              max={100}
              value={quality}
              onValueChange={(val) => {
                if (typeof val === "number") {
                  onQualityChange(val);
                } else if (Array.isArray(val) && typeof val[0] === "number") {
                  onQualityChange(val[0]);
                }
              }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Compression Level</label>
                <SliderValue className="text-sm tabular-nums text-muted-foreground" />
              </div>
            </Slider>

            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Watched Folders</label>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Autocomplete
                    items={searchResults}
                    onValueChange={(val) => {
                      if (val) {
                        setSearchValue(val);
                        addFolder(val);
                      }
                    }}
                    value={searchValue}
                  >
                    <AutocompleteInput
                      placeholder="Search or paste folder path..."
                      className="text-xs"
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
                  <FolderPlus className="size-4 mr-1.5" />
                  Add
                </Button>
              </div>

              <div
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${isDragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted-foreground/25 text-muted-foreground"
                  }`}
              >
                <AddFolderLinear className="size-6" />
                <p className="text-xs">Drop folders here to watch</p>
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm data-panel-open:[&_svg]:rotate-180 [&_svg]:transition-transform [&_svg]:duration-200">
                  <span>Currently Watching ({watchedFolders.length})</span>
                  <AltArrowDownLinear className="size-4" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 max-h-[150px] overflow-y-auto pr-1 select-none">
                    <CheckboxGroup value={selectedFolders} className="gap-2">
                      <label className="flex items-center gap-2 pb-2">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={someSelected}
                          onCheckedChange={toggleSelectAll}
                        />
                        <span className="text-xs font-medium">Select All</span>
                      </label>
                      {watchedFolders.map((folder) => (
                        <label key={folder} className="flex items-center gap-2" title={folder}>
                          <Checkbox
                            checked={selectedFolders.includes(folder)}
                            onCheckedChange={(checked) => toggleFolder(folder, checked as boolean)}
                          />
                          <span className="text-sm truncate">{folder}</span>
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
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" size="sm" className="w-full">Close</Button>} />
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
