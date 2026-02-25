import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FormatOptions } from "@/lib/types";
import { FormatQualitySlider } from "@/components/format-quality-slider";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { SettingsCheckbox } from "@/components/ui/settings-checkbox";

type FormatKey = keyof FormatOptions;

const FORMAT_LABELS: { key: FormatKey; label: string }[] = [
  { key: "jpeg", label: "JPEG" },
  { key: "png", label: "PNG" },
  { key: "webp", label: "WebP" },
  { key: "avif", label: "AVIF" },
  { key: "heif", label: "HEIF" },
  { key: "tiff", label: "TIFF" },
  { key: "gif", label: "GIF" },
  { key: "jxl", label: "JPEG XL" },
];

export function FormatQualitySettings() {
  const [formatOptions, setFormatOptions] = useState<FormatOptions | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    invoke<FormatOptions>("get_format_options").then(setFormatOptions);
  }, []);

  const updateOptions = useCallback((updater: (prev: FormatOptions) => FormatOptions) => {
    setFormatOptions((prev) => {
      if (!prev) return prev;
      const updated = updater(prev);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        invoke("set_format_options", { options: updated });
      }, 300);
      return updated;
    });
  }, []);

  const handleQualityChange = useCallback((key: FormatKey, value: number) => {
    updateOptions((prev) => ({
      ...prev,
      [key]: { ...prev[key], quality: value },
    }));
  }, [updateOptions]);

  const handlePaletteChange = useCallback((value: boolean) => {
    updateOptions((prev) => ({
      ...prev,
      png: { ...prev.png, palette: value },
    }));
  }, [updateOptions]);

  if (!formatOptions) return null;

  return (
    <Tabs
      className="w-full flex-row"
      defaultValue="jpeg"
      orientation="vertical"
    >
      <div className="border-s">
        <TabsList variant="underline">
          {FORMAT_LABELS.map(({ key, label }) => (
            <TabsTab key={key} value={key}>
              {label}
            </TabsTab>
          ))}
        </TabsList>
      </div>
      {FORMAT_LABELS.map(({ key }) => (
        <TabsPanel key={key} value={key}>
          <div className="space-y-3">
            <FormatQualitySlider
              label="Quality"
              value={formatOptions[key].quality}
              onValueChange={(val) => handleQualityChange(key, val)}
            />
            {key === "png" && (
              <SettingsCheckbox
                checked={formatOptions.png.palette}
                onCheckedChange={handlePaletteChange}
                title="Palette"
                description="Reduce to 256 colors for smaller file sizes. Best for graphics and icons."
              />
            )}
          </div>
        </TabsPanel>
      ))}
    </Tabs>
  );
}
