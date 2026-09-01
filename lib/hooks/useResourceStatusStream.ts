import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";

export interface ResourceStatus {
  state: string;
  message?: string;
  replicas?: number;
  readyReplicas?: number;
  clusterIP?: string;
  externalIP?: string;
  nodePort?: number;
  phase?: string;
  loadBalancerIP?: string;
  loadBalancerHostname?: string;
}

export interface ResourceMetadata {
  id: string;
  name: string;
  namespace: string;
  type: string;
  status: string;
  spec: Record<string, unknown>;
}

export interface UseResourceStatusStreamResult {
  resourceStatus: ResourceStatus | null;
  metadata: ResourceMetadata | null;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const RECONNECT_DELAY_MS = 3000;

// Global connection tracker to prevent duplicate connections across all instances
const activeConnections = new Set<string>();

export function useResourceStatusStream(
  resourceId: string,
  enabled: boolean = true
): UseResourceStatusStreamResult {
  const [resourceStatus, setResourceStatus] = useState<ResourceStatus | null>(
    null
  );
  const [metadata, setMetadata] = useState<ResourceMetadata | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<{ close: () => void } | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isConnectingRef = useRef<boolean>(false);
  const connectionKeyRef = useRef<string | null>(null);

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

    // Remove from global tracker using stored key after a small delay
    if (connectionKeyRef.current) {
      const keyToDelete = connectionKeyRef.current;
      setTimeout(() => {
        activeConnections.delete(keyToDelete);
      }, 100);
      connectionKeyRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled || !resourceId) {
      isConnectingRef.current = false;
      return;
    }

    const connectionKey = `resource-status-${resourceId}`;

    // Prevent duplicate connections globally
    if (isConnectingRef.current || activeConnections.has(connectionKey)) {
      return;
    }

    // First cleanup old connection if exists
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Now mark as connecting and add to set
    isConnectingRef.current = true;
    activeConnections.add(connectionKey);
    connectionKeyRef.current = connectionKey;

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/resources/${resourceId}/stream`;

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

      // Store the reader in ref so we can cancel it
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
                      // Initial resource state
                      setMetadata(parsedData);
                      break;

                    case "status_update":
                      // Real-time status update from ResourceWatcher
                      const statusData = parsedData.status || parsedData;
                      setResourceStatus(statusData);
                      break;

                    case "error":
                      setError(
                        typeof parsedData === "string" ? parsedData : data
                      );
                      break;

                    case "complete":
                      setIsConnected(false);
                      break;

                    default:
                      console.warn(
                        "Unknown resource SSE event type:",
                        eventType
                      );
                  }
                } catch (err) {
                  console.error("Failed to parse resource status event:", err);
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
      console.error("Failed to connect to resource status stream:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnected(false);
      isConnectingRef.current = false;
      activeConnections.delete(connectionKey);

      // Auto-reconnect after delay
      if (enabled) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      }
    }
  }, [enabled, resourceId]);

  const reconnect = useCallback(() => {
    cleanup();
    setResourceStatus(null);
    setMetadata(null);
    connect();
  }, [cleanup, connect]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && resourceId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, resourceId, connect, cleanup]);

  return {
    resourceStatus,
    metadata,
    isConnected,
    error,
    reconnect,
  };
}
