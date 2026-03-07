import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "./ui/label";

interface OptionSelectProps {
	label: string;
	description?: string;
	value: string | null;
	onValueChange: (val: string | null) => void;
	options: { value: string; label: string }[];
	placeholder?: string;
}

export function OptionSelect({
	label,
	description,
	value,
	onValueChange,
	options,
	placeholder = "Default",
}: OptionSelectProps) {
	return (
		<div className="flex flex-col items-start gap-1.5">
			<Label className="font-medium text-foreground text-sm">{label}</Label>
			{description && <span className="text-muted-foreground text-xs">{description}</span>}
			<Select value={value ?? ""} onValueChange={(val) => onValueChange(val === "" ? null : val)}>
				<SelectTrigger size="sm" className="w-auto min-w-0">
					<SelectValue>
						{value ? (options.find((o) => o.value === value)?.label ?? value) : placeholder}
					</SelectValue>
				</SelectTrigger>
				<SelectPopup>
					<SelectItem value="">{placeholder}</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectPopup>
			</Select>
		</div>
	);
}
