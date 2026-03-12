import { Tuning2Linear } from "@solar-icons/react-perf";
import type { Event } from "@tauri-apps/api/event";
import { type DragDropEvent, getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsContent } from "@/components/settings-content";
import { Button } from "@/components/ui/button";
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
import { Toggle } from "@/components/ui/toggle";

interface SettingsDialogProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	watchedFolders: string[];
	addFolder: (path: string) => Promise<void>;
	removeFolder: (path: string) => Promise<void>;
}

export function SettingsDialog({
	open,
	onOpenChange,
	watchedFolders,
	addFolder,
	removeFolder,
}: SettingsDialogProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const [activeTab, setActiveTab] = useState("compression");
	const dialogOpenRef = useRef(false);
	const activeTabRef = useRef("compression");
	const dragHasFolderRef = useRef(false);

	const handleActiveTabChange = useCallback((tab: string) => {
		setActiveTab(tab);
		activeTabRef.current = tab;
	}, []);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			dialogOpenRef.current = open;
			if (!open) setIsDragOver(false);
			onOpenChange?.(open);
		},
		[onOpenChange]
	);

	useEffect(() => {
		if (open !== undefined) {
			dialogOpenRef.current = open;
		}
	}, [open]);

	useEffect(() => {
		const appWindow = getCurrentWindow();
		let cancelled = false;

		const setup = async () => {
			const unlisten = await appWindow.onDragDropEvent((event: Event<DragDropEvent>) => {
				if (cancelled || !dialogOpenRef.current) return;

				const payload = event.payload;
				if (payload.type === "enter") {
					const hasFolder = payload.paths.some((path: string) => {
						const name = path.split(/[/\\]/).pop() || "";
						return !name.includes(".");
					});
					dragHasFolderRef.current = hasFolder;

					if (hasFolder && activeTabRef.current === "folders") {
						setIsDragOver(true);
					}
				} else if (payload.type === "over") {
					if (dragHasFolderRef.current && activeTabRef.current === "folders") {
						setIsDragOver(true);
					}
				} else {
					dragHasFolderRef.current = false;
					setIsDragOver(false);
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

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{open === undefined && (
				<DialogTrigger
					render={<Toggle pressed={false} variant="outline" size="sm" aria-label="Settings" />}
				>
					<Tuning2Linear />
				</DialogTrigger>
			)}
			<DialogPopup className="h-[80vh] min-w-2xl lg:min-w-[60vw]" bottomStickOnMobile={false}>
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Configure compression and appearance.</DialogDescription>
				</DialogHeader>
				<DialogPanel className="h-full">
					<SettingsContent
						watchedFolders={watchedFolders}
						addFolder={addFolder}
						removeFolder={removeFolder}
						activeTab={activeTab}
						onActiveTabChange={handleActiveTabChange}
						isDragOver={isDragOver}
					/>
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
