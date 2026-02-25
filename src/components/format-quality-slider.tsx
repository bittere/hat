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
        <label className="text-sm font-medium text-foreground">{label}</label>
        <SliderValue className="text-sm tabular-nums text-muted-foreground" />
      </div>
    </Slider>
  );
}
