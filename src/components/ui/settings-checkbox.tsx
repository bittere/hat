import { Checkbox } from "./checkbox";
import { cn } from "@/lib/utils";

interface SettingsCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function SettingsCheckbox({
  checked,
  onCheckedChange,
  title,
  description,
  disabled,
  className,
}: SettingsCheckboxProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer select-none py-1",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c as boolean)}
        disabled={disabled}
        className="mt-0.5 shrink-0"
      />
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
    </label>
  );
}
