import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";

export interface ImportLog {
  timestamp: string;
  stage: string;
  message: string;
  level: "info" | "warn" | "error";
}

export type ImportSessionStatus =
  | "pending"
  | "cloning"
  | "analyzing"
  | "completed"
  | "failed";

export interface ImportSession {
  id: string;
  status: ImportSessionStatus;
  currentStage: string;
  progress: number;
  errorMessage?: string;
  errorStage?: string;
  analysis?: ImportAnalysis;
}

export interface SourceBuildConfig {
  repoUrl: string;
  branch: string;
  buildContext: string;
  useNixpacks: boolean;
  dockerfile?: string;
}

export interface ImportAnalysis {
  detectedType: string;
  services: unknown[];
  volumes: unknown[];
  networks: unknown[];
  suggestedNodes: unknown[];
  suggestedEdges: unknown[];
  layoutPositions: Record<string, { x: number; y: number }>;
  warnings: string[];
  errors: unknown[];
  needsBuild?: boolean;
  sourceBuildConfig?: SourceBuildConfig;
}

export interface UseImportStreamResult {
  session: ImportSession | null;
  logs: ImportLog[];
  analysis: ImportAnalysis | null;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const RECONNECT_DELAY_MS = 3000;

// Global connection tracker to prevent duplicate connections
const activeConnections = new Set<string>();

export function useImportStream(
  sessionId: string,
  enabled: boolean = true
): UseImportStreamResult {
  const [session, setSession] = useState<ImportSession | null>(null);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<{ close: () => void } | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const connectionKeyRef = useRef<string | null>(null);
  const sessionStatusRef = useRef<ImportSessionStatus | null>(null);

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
    if (!enabled || !sessionId) {
      isConnectingRef.current = false;
      return;
    }

    const connectionKey = `import-stream-${sessionId}`;

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
    const url = `${baseUrl}/import/${sessionId}/stream`;

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
      eventSourceRef.current = {
        close: () => {
          reader.cancel();
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
                      // Initial session state
                      setSession(parsedData);
                      sessionStatusRef.current = parsedData.status;
                      if (parsedData.analysis) {
                        setAnalysis(parsedData.analysis);
                      }
                      break;

                    case "log":
                      // Log line
                      const logEntry: ImportLog = {
                        timestamp:
                          parsedData.timestamp || new Date().toISOString(),
                        stage: parsedData.data?.stage || parsedData.stage || "",
                        message:
                          parsedData.data?.message || parsedData.message || "",
                        level:
                          parsedData.data?.level || parsedData.level || "info",
                      };
                      setLogs(prev => [...prev, logEntry]);
                      break;

                    case "progress":
                      // Status/progress update
                      setSession(prev => {
                        const newSession: ImportSession = prev
                          ? { ...prev }
                          : {
                              id: sessionId,
                              status: "pending",
                              currentStage: "",
                              progress: 0,
                            };
                        const newStatus =
                          parsedData.data?.status ||
                          parsedData.status ||
                          newSession.status;
                        sessionStatusRef.current = newStatus;
                        return {
                          ...newSession,
                          status: newStatus,
                          currentStage:
                            parsedData.data?.current_stage ||
                            parsedData.current_stage ||
                            newSession.currentStage,
                          progress:
                            parsedData.data?.progress ??
                            parsedData.progress ??
                            newSession.progress,
                        };
                      });
                      break;

                    case "complete":
                      // Import finished successfully
                      const completedAnalysis =
                        parsedData.data?.analysis || parsedData.analysis;
                      if (completedAnalysis) {
                        setAnalysis(completedAnalysis);
                      }
                      sessionStatusRef.current = "completed";
                      setSession(prev => ({
                        ...(prev || {
                          id: sessionId,
                          currentStage: "Completed",
                          progress: 100,
                        }),
                        status: "completed" as ImportSessionStatus,
                        currentStage: "Completed",
                        progress: 100,
                        analysis: completedAnalysis,
                      }));
                      setIsConnected(false);
                      break;

                    case "failed":
                      // Import failed
                      sessionStatusRef.current = "failed";
                      setSession(prev => ({
                        ...(prev || {
                          id: sessionId,
                          currentStage: "Failed",
                          progress: 0,
                        }),
                        status: "failed" as ImportSessionStatus,
                        currentStage: "Failed",
                        errorMessage:
                          parsedData.data?.error_message ||
                          parsedData.error_message ||
                          parsedData.error,
                        errorStage:
                          parsedData.data?.error_stage ||
                          parsedData.error_stage,
                      }));
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
                      console.warn("Unknown import SSE event type:", eventType);
                  }
                } catch (err) {
                  console.error("Failed to parse import event:", err, data);
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
      console.error("Failed to connect to import stream:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnected(false);
      isConnectingRef.current = false;
      activeConnections.delete(connectionKey);

      // Auto-reconnect after delay (only if import is still in progress)
      if (
        enabled &&
        sessionStatusRef.current &&
        !isImportTerminal(sessionStatusRef.current)
      ) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      }
    }
  }, [enabled, sessionId]);

  const reconnect = useCallback(() => {
    cleanup();
    // Clear logs on reconnect
    setLogs([]);
    connect();
  }, [cleanup, connect]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && sessionId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, sessionId, connect, cleanup]);

  return {
    session,
    logs,
    analysis,
    isConnected,
    error,
    reconnect,
  };
}

// Helper to check if import is in terminal state
function isImportTerminal(status: ImportSessionStatus): boolean {
  return ["completed", "failed"].includes(status);
}
