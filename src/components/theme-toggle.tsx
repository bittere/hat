import { Moon, Sun } from "@solar-icons/react-perf/Bold";
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
      pressed={isDark}
      onPressedChange={(pressed) => setTheme(pressed ? "dark" : "light")}
      variant="outline"
      size="sm"
      aria-label="Toggle theme"
    >
      {isDark ? <Moon /> : <Sun />}
    </Toggle>
  );
}
