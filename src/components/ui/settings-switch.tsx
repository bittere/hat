import { cn } from "@/lib/utils";
import { Switch } from "./switch";

interface SettingsSwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	title: string;
	description?: string;
	disabled?: boolean;
	className?: string;
}

export function SettingsSwitch({
	checked,
	onCheckedChange,
	title,
	description,
	disabled,
	className,
}: SettingsSwitchProps) {
	return (
		<label
			className={cn(
				"flex cursor-pointer select-none items-center justify-between gap-4 py-2",
				disabled && "cursor-not-allowed opacity-60",
				className
			)}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium text-foreground text-sm leading-tight">{title}</span>
				{description && (
					<span className="text-muted-foreground text-xs leading-normal">{description}</span>
				)}
			</div>
			<Switch
				checked={checked}
				onCheckedChange={onCheckedChange}
				disabled={disabled}
				className="shrink-0"
			/>
		</label>
	);
}
