import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { Build, BuildLog, BuildStatus } from "@/lib/services/build";
import { getApiBaseUrl } from "@/lib/runtime-config";

export interface UseBuildStreamResult {
  build: Build | null;
  logs: BuildLog[];
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const RECONNECT_DELAY_MS = 3000;

// Global connection tracker to prevent duplicate connections
const activeConnections = new Set<string>();

export function useBuildStream(
  buildId: string,
  enabled: boolean = true
): UseBuildStreamResult {
  const [build, setBuild] = useState<Build | null>(null);
  const [logs, setLogs] = useState<BuildLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<{ close: () => void } | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const connectionKeyRef = useRef<string | null>(null);
  const buildStatusRef = useRef<BuildStatus | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);

    // Remove from global tracker with delay for React StrictMode
    if (connectionKeyRef.current) {
      const keyToDelete = connectionKeyRef.current;
      setTimeout(() => {
        activeConnections.delete(keyToDelete);
      }, 100);
      connectionKeyRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled || !buildId) {
      isConnectingRef.current = false;
      return;
    }

    const connectionKey = `build-stream-${buildId}`;

    // Prevent duplicate connections globally
    if (isConnectingRef.current || activeConnections.has(connectionKey)) {
      return;
    }

    // Cleanup old connection if exists
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Mark as connecting
    isConnectingRef.current = true;
    activeConnections.add(connectionKey);
    connectionKeyRef.current = connectionKey;

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/builds/${buildId}/stream`;

    // Get token from Zustand store
    const token = useAuthStore.getState().token;

    if (!token) {
      setError("No authentication token found");
      isConnectingRef.current = false;
      return;
    }

    try {
      // Use fetch with streaming to support Authorization headers
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      setIsConnected(true);
      setError(null);
      isConnectingRef.current = false;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Store reader in ref for cleanup
      const abortController = new AbortController();
      eventSourceRef.current = {
        close: () => {
          reader.cancel();
          abortController.abort();
        },
      };

      // Process the stream
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              setIsConnected(false);
              break;
            }

            // Decode the chunk
            buffer += decoder.decode(value, { stream: true });

            // SSE format: "event: eventname\ndata: data\n\n"
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;

              const eventMatch = line.match(/^event:\s*(.+)$/m);
              const dataMatch = line.match(/^data:\s*(.+)$/m);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = dataMatch[1];

                try {
                  const parsedData = JSON.parse(data);

                  switch (eventType) {
                    case "metadata":
                      // Initial build state
                      setBuild(parsedData);
                      buildStatusRef.current = parsedData.status;
                      break;

                    case "log":
                      // Build log line - data can be nested in parsedData.data or directly in parsedData
                      const logData = parsedData.data || parsedData;
                      const logEntry: BuildLog = {
                        timestamp:
                          parsedData.timestamp || new Date().toISOString(),
                        stage: logData.stage || logData.currentStage || "",
                        message: logData.message || "",
                        level: logData.level || "info",
                        stream: logData.stream,
                      };
                      setLogs(prev => [...prev, logEntry]);
                      break;

                    case "progress":
                      // Status/progress update - data can be nested
                      const progressData = parsedData.data || parsedData;
                      setBuild(prev => {
                        if (!prev) return parsedData;
                        const newStatus = progressData.status || prev.status;
                        buildStatusRef.current = newStatus;
                        return {
                          ...prev,
                          status: newStatus,
                          currentStage:
                            progressData.current_stage ||
                            progressData.currentStage ||
                            prev.currentStage,
                          progress: progressData.progress ?? prev.progress,
                        };
                      });
                      break;

                    case "complete":
                      // Build finished successfully - data can be nested
                      const completeData = parsedData.data || parsedData;
                      buildStatusRef.current = "completed";
                      setBuild(prev => {
                        if (!prev) return parsedData;
                        return {
                          ...prev,
                          status: "completed" as BuildStatus,
                          currentStage: "Completed",
                          progress: 100,
                          finalImageRef:
                            completeData.final_image_ref ||
                            completeData.finalImageRef ||
                            prev.finalImageRef,
                          imageDigest:
                            completeData.image_digest ||
                            completeData.imageDigest ||
                            prev.imageDigest,
                          imageSize:
                            completeData.image_size ||
                            completeData.imageSize ||
                            prev.imageSize,
                        };
                      });
                      setIsConnected(false);
                      break;

                    case "failed":
                      // Build failed - data can be nested
                      const failedData = parsedData.data || parsedData;
                      buildStatusRef.current = "failed";
                      setBuild(prev => {
                        if (!prev) return parsedData;
                        return {
                          ...prev,
                          status: "failed" as BuildStatus,
                          currentStage: "Failed",
                          errorMessage:
                            failedData.error_message ||
                            failedData.errorMessage ||
                            failedData.error,
                          errorStage:
                            failedData.error_stage || failedData.errorStage,
                        };
                      });
                      setIsConnected(false);
                      break;

                    case "cancelled":
                      // Build cancelled
                      buildStatusRef.current = "cancelled";
                      setBuild(prev => {
                        if (!prev) return parsedData;
                        return {
                          ...prev,
                          status: "cancelled" as BuildStatus,
                          currentStage: "Cancelled",
                        };
                      });
                      setIsConnected(false);
                      break;

                    case "error":
                      setError(
                        typeof parsedData === "string"
                          ? parsedData
                          : parsedData.error || data
                      );
                      break;

                    default:
                      console.warn("Unknown build SSE event type:", eventType);
                  }
                } catch (err) {
                  console.error("Failed to parse build event:", err);
                }
              }
            }
          }
        } catch (err) {
          console.error("Stream processing error:", err);
          setError(
            err instanceof Error ? err.message : "Failed to process stream"
          );
          setIsConnected(false);
        }
      };

      processStream();
    } catch (err) {
      console.error("Failed to connect to build stream:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnected(false);
      isConnectingRef.current = false;
      activeConnections.delete(connectionKey);

      // Auto-reconnect after delay (only if build is still in progress)
      if (
        enabled &&
        buildStatusRef.current &&
        !isBuildTerminal(buildStatusRef.current)
      ) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      }
    }
  }, [enabled, buildId]);

  const reconnect = useCallback(() => {
    cleanup();
    // Clear logs on reconnect
    setLogs([]);
    connect();
  }, [cleanup, connect]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && buildId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, buildId, connect, cleanup]);

  return {
    build,
    logs,
    isConnected,
    error,
    reconnect,
  };
}

// Helper to check if build is in terminal state
function isBuildTerminal(status: BuildStatus): boolean {
  return ["completed", "failed", "cancelled"].includes(status);
}
