import { MoonLinear, SunLinear } from "@solar-icons/react-perf";
import { Toggle } from "@/components/ui/toggle";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Toggle
      pressed={false}
      onPressedChange={() => setTheme(isDark ? "light" : "dark")}
      variant="outline"
      size="sm"
      aria-label="Toggle theme"
    >
      {isDark ? <MoonLinear /> : <SunLinear />}
    </Toggle>
  );
}
