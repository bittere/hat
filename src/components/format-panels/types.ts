import type { FormatKey } from "@/components/format-select";

export interface FormatPanelProps {
	formatOptions: Record<string, unknown>;
	onQualityChange: (key: FormatKey, value: number) => void;
	onFieldChange: <K extends FormatKey>(key: K, field: string, value: unknown) => void;
}
