import { ThemeToggle } from "@/components/theme-toggle";
import "./App.css";

function App() {
  return (
    <main>
      <header className="flex w-full items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">Hat</h1>
        <ThemeToggle />
      </header>
    </main>
  );
}

export default App;
