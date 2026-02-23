import { Tuning2Linear } from "@solar-icons/react-perf";
import { Toggle } from "@/components/ui/toggle";
import { Slider, SliderValue } from "@/components/ui/slider";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "@/components/ui/dialog";

interface SettingsDialogProps {
  quality: number;
  onQualityChange: (value: number) => void;
}

export function SettingsDialog({ quality, onQualityChange }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Toggle pressed={false} variant="outline" size="sm" aria-label="Settings" />
        }
      >
        <Tuning2Linear />
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure compression options.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <Slider
            min={1}
            max={100}
            value={quality}
            onValueChange={onQualityChange}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Compression Level</label>
              <SliderValue className="text-sm tabular-nums text-muted-foreground" />
            </div>
          </Slider>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
