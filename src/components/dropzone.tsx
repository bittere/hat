import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DropzoneProps {
	icon: ReactNode;
	children: ReactNode;
	isDragOver?: boolean;
	onClick?: () => void;
	className?: string;
}

export function Dropzone({ icon, children, isDragOver, onClick, className }: DropzoneProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary",
				isDragOver
					? "border-primary bg-primary/5 text-primary"
					: "border-muted-foreground/25 text-muted-foreground",
				className
			)}
			onClick={onClick}
		>
			{icon}
			<p className="text-xs">{children}</p>
		</button>
	);
}
