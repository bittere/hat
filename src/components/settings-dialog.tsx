import { useEffect, useState } from "react";
import { Tuning2Linear } from "@solar-icons/react-perf";
import { FolderPlus, Trash2, ChevronDown } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Toggle } from "@/components/ui/toggle";
import { Slider, SliderValue } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
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
import { Spinner } from "@/components/ui/spinner";

interface SettingsDialogProps {
  quality: number;
  onQualityChange: (value: number) => void;
}

export function SettingsDialog({ quality, onQualityChange }: SettingsDialogProps) {
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [watchedFolders, setWatchedFolders] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("get_watched_folders").then(setWatchedFolders);
  }, []);

  useEffect(() => {
    if (!searchValue) {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let ignore = false;

    const timeoutId = setTimeout(async () => {
      try {
        const results = await invoke<string[]>("search_directories", { query: searchValue });
        if (!ignore) setSearchResults(results);
      } catch (err) {
        console.error("Failed to search directories", err);
        if (!ignore) setSearchResults([]);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      ignore = true;
    };
  }, [searchValue]);

  const addFolder = async (path: string) => {
    if (!path) return;
    try {
      const folders = await invoke<string[]>("add_watched_folder", { path });
      setWatchedFolders(folders);
      setSearchValue("");
    } catch (err) {
      console.error("Failed to add folder", err);
    }
  };

  const removeFolder = async (path: string) => {
    try {
      const folders = await invoke<string[]>("remove_watched_folder", { path });
      setWatchedFolders(folders);
    } catch (err) {
      console.error("Failed to remove folder", err);
    }
  };

  return (
    <Dialog>
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
              onValueChange={onQualityChange}
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
                    filter={null}
                    items={searchResults}
                    onValueChange={(val) => {
                       if (typeof val === 'string') {
                         setSearchValue(val);
                       }
                    }}
                    onSelectionChange={(val) => {
                       if (val) addFolder(val as string);
                    }}
                    value={searchValue}
                  >
                    <AutocompleteInput
                      placeholder="Search or paste folder path..."
                      className="font-mono text-xs"
                    />
                    {searchValue !== "" && (
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
                            <AutocompleteItem key={path} value={path} className="font-mono text-xs">
                              {path}
                            </AutocompleteItem>
                          )}
                        </AutocompleteList>
                      </AutocompletePopup>
                    )}
                  </Autocomplete>
                </div>
                <Button
                  size="sm"
                  onClick={() => addFolder(searchValue)}
                  disabled={!searchValue}
                >
                  <FolderPlus className="size-4 mr-1.5" />
                  Add
                </Button>
              </div>

              <Collapsible defaultOpen={true}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <span>Currently Watching (${watchedFolders.length})</span>
                  <ChevronDown className="size-4" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-1 max-h-[150px] overflow-y-auto pr-1">
                    {watchedFolders.map((folder) => (
                      <div key={folder} className="flex items-center justify-between group rounded-md border bg-muted/30 p-2">
                        <span className="font-mono text-[10px] truncate flex-1" title={folder}>
                          {folder}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 group-hover:opacity-100"
                          onClick={() => removeFolder(folder)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
