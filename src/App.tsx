import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "./components/TitleBar";
import "./App.css";

interface CompressionTask {
  id: string;
  filename: string;
  status: "pending" | "compressing" | "completed" | "error";
  original_size: number;
  compressed_size?: number;
  progress: number;
  error?: string;
}

function App() {
  const [tasks, setTasks] = useState<CompressionTask[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [quality, setQuality] = useState(30);
  const [watchedFolders, setWatchedFolders] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const settings: any = await invoke("get_settings");
        setQuality(settings.quality);
        setWatchedFolders(settings.watched_folders);
      } catch (e) {
        console.error("Failed to init settings:", e);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      try {
        const result = await invoke<CompressionTask[]>(
          "get_compression_status"
        );
        setTasks(result);
      } catch (error) {
        console.error("Failed to fetch compression status:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  const totalSavings = tasks.reduce((sum, task) => {
    if (task.compressed_size) {
      return sum + (task.original_size - task.compressed_size);
    }
    return sum;
  }, 0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
    );
  };

  const completedCount = tasks.filter((t) => t.status === "completed").length;

  const handleDeleteOriginals = async () => {
    if (!window.confirm("Are you sure you want to delete the original files for all completed compressions? This cannot be undone.")) {
      return;
    }
    try {
      await invoke("delete_originals");
      console.log("Originals deleted");
      // Clear completed tasks after deleting originals to refresh UI
      await invoke("clear_completed");
    } catch (error) {
      console.error("Failed to delete originals:", error);
    }
  };

  const handleClearCompleted = async () => {
    try {
      await invoke("clear_completed");
    } catch (error) {
      console.error("Failed to clear completed tasks:", error);
    }
  };

  const handleQualityChange = async (newQuality: number) => {
    setQuality(newQuality);
    try {
      await invoke("set_quality", { quality: newQuality });
    } catch (error) {
      console.error("Failed to update quality:", error);
    }
  };

  const handleAddDirectory = async () => {
    try {
      const settings: any = await invoke("add_directory");
      setWatchedFolders(settings.watched_folders);
    } catch (error) {
      if (error !== "No folder selected") {
        console.error("Failed to add directory:", error);
      }
    }
  };

  const handleRemoveDirectory = async (path: string) => {
    try {
      const settings: any = await invoke("remove_directory", { path });
      setWatchedFolders(settings.watched_folders);
    } catch (error) {
      console.error("Failed to remove directory:", error);
    }
  };

  return (
    <div className="app">
      <TitleBar />
      <header className="app-header">
        <h1>Hat</h1>
        <p>Automatic Image Compressor</p>
      </header>
      <main className="app-main">
        <div className="compression-status">
          <div className="status-header">
            <h2>Compression Queue</h2>
            <div className="settings-panel">
              <div className="quality-slider">
                <div className="slider-header">
                  <span>Quality: {quality}%</span>
                  <span className="quality-label">
                    {quality < 40 ? "High Compression" : quality > 70 ? "High Quality" : "Balanced"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={quality}
                  onChange={(e) => handleQualityChange(parseInt(e.target.value))}
                  className="modern-slider"
                />
              </div>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={isMonitoring}
                  onChange={(e) => setIsMonitoring(e.target.checked)}
                />
                <span>Monitoring</span>
              </label>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state">
              <p>Waiting for images in folders...</p>
              <small>Supported formats: JPG, PNG, WebP</small>
            </div>
          ) : (
            <>
              <div className="stats">
                <div className="stat">
                  <span className="label">Total Processed</span>
                  <span className="value">{completedCount}</span>
                </div>
                <div className="stat">
                  <span className="label">Space Saved</span>
                  <span className="value">{formatBytes(totalSavings)}</span>
                </div>
                <div className="stat actions">
                  <span className="label">Queue Actions</span>
                  <div className="action-buttons">
                    <button
                      onClick={handleClearCompleted}
                      className="btn-secondary"
                      disabled={completedCount === 0}
                    >
                      Clear Queue
                    </button>
                    <button
                      onClick={handleDeleteOriginals}
                      className="btn-danger"
                      disabled={completedCount === 0}
                    >
                      Delete Originals
                    </button>
                  </div>
                </div>
              </div>

              <div className="tasks-list">
                {tasks.map((task) => (
                  <div key={task.id} className={`task ${task.status}`}>
                    <div className="task-info">
                      <p className="task-filename">{task.filename}</p>
                      {task.status === "compressing" && (
                        <p className="task-size">{task.progress}% compressed</p>
                      )}
                      {task.status === "completed" && task.compressed_size && (
                        <p className="task-size">
                          {formatBytes(task.original_size)} →{" "}
                          {formatBytes(task.compressed_size)}
                        </p>
                      )}
                      {task.error && (
                        <p className="task-error">{task.error}</p>
                      )}
                    </div>
                    <div className="task-status">
                      {task.status === "compressing" && (
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${task.progress}%` }}
                          ></div>
                        </div>
                      )}
                      {task.status === "completed" && (
                        <span className="badge success">✓ Done</span>
                      )}
                      {task.status === "error" && (
                        <span className="badge error">✗ Error</span>
                      )}
                      {task.status === "pending" && (
                        <span className="badge pending">⏳ Pending</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="folder-management">
          <span className="footer-label">Watching:</span>
          <div className="folder-list">
            {watchedFolders.map((path) => (
              <div key={path} className="folder-item">
                <span title={path}>{path.split(/[\\/]/).pop()}</span>
                <button
                  onClick={() => handleRemoveDirectory(path)}
                  className="btn-icon-danger"
                  disabled={watchedFolders.length <= 1}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button onClick={handleAddDirectory} className="btn-secondary-sm">
            + Add Folder
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
