import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";

export interface LogStreamMetadata {
  pod: string;
  container: string;
  namespace: string;
  cluster: string;
}

export interface ParsedLog {
  id: number;
  timestamp: string;
  message: string;
  raw: string;
}

export interface UseLogStreamResult {
  logs: ParsedLog[];
  isConnected: boolean;
  error: string | null;
  metadata: LogStreamMetadata | null;
  clearLogs: () => void;
  reconnect: () => void;
}

const MAX_LOG_LINES = 5000;
const RECONNECT_DELAY_MS = 3000;

export function useLogStream(
  resourceId: string,
  enabled: boolean = true,
  follow: boolean = true,
  tailLines: number = 100
): UseLogStreamResult {
  const [logs, setLogs] = useState<ParsedLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<LogStreamMetadata | null>(null);
  const [connectKey, setConnectKey] = useState(0); // Increment to force reconnect
  const logIdCounter = useRef(0);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const reconnect = useCallback(() => {
    setLogs([]);
    setError(null);
    setConnectKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !resourceId) return;

    const abortController = new AbortController();

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/resources/${resourceId}/logs/stream?follow=${follow}&tail=${tailLines}`;
    const token = useAuthStore.getState().token;

    if (!token) {
      setError("No authentication token found");
      return;
    }

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const startStream = async () => {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("Response body is null");
        }

        setIsConnected(true);
        setError(null);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (!abortController.signal.aborted) {
            const { done, value } = await reader.read();

            if (done) {
              setIsConnected(false);
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() || "";

            for (const chunk of chunks) {
              if (!chunk.trim()) continue;

              const eventMatch = chunk.match(/^event:\s*(.+)$/m);
              const dataMatch = chunk.match(/^data:\s*(.+)$/m);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = dataMatch[1];

                switch (eventType) {
                  case "metadata":
                    try {
                      setMetadata(JSON.parse(data));
                    } catch {
                      // Silent fail
                    }
                    break;
                  case "log": {
                    const ts = data.match(/^(\S+)\s+(.*)$/);
                    const parsed: ParsedLog = {
                      id: logIdCounter.current++,
                      timestamp: ts?.[1] || "",
                      message: ts?.[2] || data,
                      raw: data,
                    };
                    setLogs(prev => {
                      const next = [...prev, parsed];
                      return next.length > MAX_LOG_LINES
                        ? next.slice(-MAX_LOG_LINES)
                        : next;
                    });
                    break;
                  }
                  case "error":
                    setError(data);
                    setIsConnected(false);
                    break;
                  case "complete":
                    setIsConnected(false);
                    return;
                }
              }
            }
          }
        } catch (err) {
          if (abortController.signal.aborted) return;
          throw err;
        }
      } catch (err) {
        if (abortController.signal.aborted) return;

        setError(err instanceof Error ? err.message : "Connection failed");
        setIsConnected(false);

        if (follow && enabled) {
          reconnectTimeout = setTimeout(() => {
            if (!abortController.signal.aborted) {
              startStream();
            }
          }, RECONNECT_DELAY_MS);
        }
      }
    };

    startStream();

    return () => {
      abortController.abort();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      setIsConnected(false);
    };
    // connectKey forces re-run when reconnect() is called
  }, [enabled, resourceId, follow, tailLines, connectKey]);

  return {
    logs,
    isConnected,
    error,
    metadata,
    clearLogs,
    reconnect,
  };
}
