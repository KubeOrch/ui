import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";

export interface NodeStatus {
  state: string;
  message?: string;
  replicas?: number;
  readyReplicas?: number;
  clusterIP?: string;
  externalIP?: string;
  nodePort?: number;
}

export interface UseWorkflowStatusStreamResult {
  nodeStatuses: Map<string, NodeStatus>;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const RECONNECT_DELAY_MS = 3000; // Delay before auto-reconnecting after error

// Global connection tracker to prevent duplicate connections across all instances
const activeConnections = new Set<string>();

export function useWorkflowStatusStream(
  workflowId: string,
  enabled: boolean = true
): UseWorkflowStatusStreamResult {
  // Use Map to store statuses by node ID - doesn't depend on having correct node list
  const [nodeStatuses, setNodeStatuses] = useState<Map<string, NodeStatus>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<{ close: () => void } | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    // This prevents double connections in React StrictMode (mount->unmount->mount)
    if (connectionKeyRef.current) {
      const keyToDelete = connectionKeyRef.current;
      setTimeout(() => {
        activeConnections.delete(keyToDelete);
      }, 100); // Small delay to handle StrictMode double-mount
      connectionKeyRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled || !workflowId) {
      isConnectingRef.current = false;
      return;
    }

    const connectionKey = `workflow-status-${workflowId}`;

    // Prevent duplicate connections globally
    if (isConnectingRef.current || activeConnections.has(connectionKey)) {
      return;
    }

    // First cleanup old connection if exists (without removing from set yet)
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
    const url = `${baseUrl}/workflows/${workflowId}/status/stream`;

    // Get token from Zustand store
    const token = useAuthStore.getState().token;

    if (!token) {
      setError("No authentication token found");
      isConnectingRef.current = false;
      return;
    }

    try {
      // Use fetch with streaming to support Authorization headers (EventSource doesn't support custom headers)
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

              // SSE format allows optional space after colon: "event:value" or "event: value"
              const eventMatch = line.match(/^event:\s*(.+)$/m);
              const dataMatch = line.match(/^data:\s*(.+)$/m);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = dataMatch[1];

                try {
                  const parsedData = JSON.parse(data);

                  switch (eventType) {
                    case "metadata":
                      // Initial workflow state - extract node statuses if present
                      if (parsedData.nodes && parsedData.nodes.length > 0) {
                        // Extract any existing statuses from nodes
                        const initialStatuses = new Map<string, NodeStatus>();
                        for (const node of parsedData.nodes) {
                          if (node.data?._status) {
                            initialStatuses.set(node.id, node.data._status);
                          }
                        }
                        if (initialStatuses.size > 0) {
                          setNodeStatuses(initialStatuses);
                        }
                      }
                      break;

                    case "node_update":
                      // Update specific node status
                      // Unified SSE format: { type, stream_key, event_type, data: { node_id, status, type } }
                      const nodeData = parsedData.data || parsedData;
                      const nodeId = nodeData.node_id || parsedData.node_id;
                      const status = nodeData.status;

                      if (nodeId && status) {
                        // Simply store/update status by node ID - no need to have existing nodes
                        setNodeStatuses(prev => {
                          const newMap = new Map(prev);
                          newMap.set(nodeId, status);
                          return newMap;
                        });
                      }
                      break;

                    case "workflow_sync":
                      // Full workflow sync from periodic K8s check
                      if (parsedData.data && parsedData.data.nodes) {
                        const syncedStatuses = new Map<string, NodeStatus>();
                        for (const node of parsedData.data.nodes) {
                          if (node.data?._status) {
                            syncedStatuses.set(node.id, node.data._status);
                          }
                        }
                        setNodeStatuses(syncedStatuses);
                      }
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
                      console.warn("Unknown SSE event type:", eventType);
                  }
                } catch (err) {
                  console.error("Failed to parse workflow status event:", err);
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
      console.error("Failed to connect to workflow status stream:", err);
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
  }, [enabled, workflowId]);

  const reconnect = useCallback(() => {
    cleanup();
    // Clear statuses on reconnect
    setNodeStatuses(new Map());
    connect();
  }, [cleanup, connect]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && workflowId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, workflowId, connect, cleanup]);

  return {
    nodeStatuses,
    isConnected,
    error,
    reconnect,
  };
}
