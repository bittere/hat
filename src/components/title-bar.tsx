import { CloseCircleLinear, PowerLinear } from "@solar-icons/react-perf";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ReactNode } from "react";

interface TitleBarProps {
	children?: ReactNode;
}

export function TitleBar({ children }: TitleBarProps) {
	const appWindow = getCurrentWindow();

	return (
		<div
			className="flex h-8 shrink-0 items-center border-border border-b bg-background"
			data-tauri-drag-region
		>
			<div className="flex items-center gap-1.5 px-3">
				<img src="/app-icon.svg" className="h-4 w-4" alt="Logo" />
				<span className="font-semibold text-sm">Hat</span>
			</div>
			<div className="ml-auto flex items-center">{children}</div>
			<button
				type="button"
				className="inline-flex h-8 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
				onClick={() => invoke("quit_app")}
				title="Quit Hat"
			>
				<PowerLinear className="size-4" />
			</button>
			<button
				type="button"
				className="inline-flex h-8 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onClick={() => appWindow.hide()}
				title="Close window"
			>
				<CloseCircleLinear className="size-4" />
			</button>
		</div>
	);
}
