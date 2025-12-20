import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const updateMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };

    updateMaximized();

    const unlisten = appWindow.onResized(() => {
      updateMaximized();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div data-tauri-drag-region className="titlebar">
      <div data-tauri-drag-region className="titlebar-logo">
        <img data-tauri-drag-region src="/app-icon.png" alt="logo" width="16" height="16" />
        <span data-tauri-drag-region className="titlebar-text">Hat</span>
      </div>
      <div className="titlebar-actions">
        <button className="titlebar-button" onClick={() => appWindow.toggleMaximize()} title={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 12 12">
              <rect x="3" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M1,3 L1,11 L9,11 L9,3 L1,3 Z M2,4 L8,4 L8,10 L2,10 L2,4 Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12">
              <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button className="titlebar-button close-button" onClick={() => appWindow.hide()} title="Close to Tray">
          <svg width="10" height="10" viewBox="0 0 12 12">
            <path d="M2.5,2.5 L9.5,9.5 M9.5,2.5 L2.5,9.5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
