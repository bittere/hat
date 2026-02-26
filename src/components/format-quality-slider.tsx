import { Slider, SliderValue } from "@/components/ui/slider";

interface FormatQualitySliderProps {
	label: string;
	value: number;
	onValueChange: (value: number) => void;
}

export function FormatQualitySlider({ label, value, onValueChange }: FormatQualitySliderProps) {
	return (
		<Slider
			min={1}
			max={100}
			value={value}
			onValueChange={(val) => {
				if (typeof val === "number") {
					onValueChange(val);
				} else if (Array.isArray(val) && typeof val[0] === "number") {
					onValueChange(val[0]);
				}
			}}
			className="space-y-1"
		>
			<div className="flex items-center justify-between">
				<label
					htmlFor={`slider-${label.replace(/\s+/g, "-").toLowerCase()}`}
					className="font-medium text-foreground text-sm"
				>
					{label}
				</label>
				<SliderValue className="text-muted-foreground text-sm tabular-nums" />
			</div>
		</Slider>
	);
}
