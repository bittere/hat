import { Switch } from "./switch";
import { cn } from "@/lib/utils";

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
        "flex items-center justify-between gap-4 cursor-pointer select-none py-2",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground leading-tight">
          {title}
        </span>
        {description && (
          <span className="text-xs text-muted-foreground leading-normal">
            {description}
          </span>
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
