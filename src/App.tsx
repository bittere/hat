import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

  const handleTestCompression = async () => {
    try {
      await invoke("test_compression");
      console.log("Test compression started");
    } catch (error) {
      console.error("Failed to start test compression:", error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Hat</h1>
        <p>Automatic Image Compressor</p>
      </header>
      <main className="app-main">
        <div className="compression-status">
          <div className="status-header">
            <h2>Compression Queue</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={isMonitoring}
                onChange={(e) => setIsMonitoring(e.target.checked)}
              />
              <span>Monitoring</span>
            </label>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state">
              <p>Waiting for images in Downloads folder...</p>
              <small>Supported formats: JPG, PNG, WebP</small>
              <button onClick={handleTestCompression} className="btn-primary">
                Test Compression
              </button>
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
    </div>
  );
}

export default App;
