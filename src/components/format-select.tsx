import type { VariantProps } from "class-variance-authority";
import type { selectTriggerVariants } from "@/components/ui/select";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "@/components/ui/select";

export type FormatKey = "jpeg" | "png";

export const FORMAT_LABELS: { key: FormatKey; label: string }[] = [
	{ key: "jpeg", label: "JPEG" },
	{ key: "png", label: "PNG" },
];

interface FormatSelectProps {
	value: string | null;
	onValueChange: (value: string | null) => void;
	/** Format key to hide from the list (e.g. the current file's format) */
	hideFormat?: FormatKey;
	/** Placeholder text when no format is selected */
	placeholder?: string;
	size?: VariantProps<typeof selectTriggerVariants>["size"];
	className?: string;
}

export function FormatSelect({
	value,
	onValueChange,
	hideFormat,
	placeholder = "Original format",
	size = "sm",
	className,
}: FormatSelectProps) {
	const selectedLabel = value ? FORMAT_LABELS.find((f) => f.key === value)?.label : null;

	return (
		<Select value={value ?? ""} onValueChange={(val) => onValueChange(val === "" ? null : val)}>
			<SelectTrigger size={size} className={className ?? "w-auto min-w-0"}>
				{selectedLabel ? (
					<span className="flex-1 truncate">{selectedLabel}</span>
				) : (
					<span className="flex-1 truncate">{placeholder}</span>
				)}
			</SelectTrigger>
			<SelectPopup>
				<SelectItem value="">{placeholder}</SelectItem>
				{FORMAT_LABELS.filter((f) => f.key !== hideFormat).map((f) => (
					<SelectItem key={f.key} value={f.key}>
						{f.label}
					</SelectItem>
				))}
			</SelectPopup>
		</Select>
	);
}
