import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";

export interface TerminalMessage {
  type: "input" | "output" | "resize" | "error" | "close" | "metadata";
  data: string;
  rows?: number;
  cols?: number;
}

export interface TerminalMetadata {
  pod: string;
  container: string;
  namespace: string;
  cluster: string;
}

export interface UseTerminalResult {
  isConnected: boolean;
  error: string | null;
  metadata: TerminalMetadata | null;
  sendInput: (data: string) => void;
  sendResize: (rows: number, cols: number) => void;
  reconnect: () => void;
  disconnect: () => void;
}

const RECONNECT_DELAY_MS = 3000;

// Global connection tracker to prevent duplicate connections
const activeConnections = new Set<string>();

export function useTerminal(
  resourceId: string,
  container?: string,
  shell: string = "/bin/sh",
  enabled: boolean = true,
  onOutput?: (data: string) => void,
  onClose?: (message: string) => void
): UseTerminalResult {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<TerminalMetadata | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const hasInitialized = useRef(false);
  const connectionKeyRef = useRef<string | null>(null);
  const shouldReconnectRef = useRef<boolean>(true);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      // Only close if the WebSocket is OPEN or CLOSING
      // Don't close if it's still CONNECTING (readyState === 0)
      // This prevents React StrictMode from closing connections before they're established
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CLOSING
      ) {
        wsRef.current.close();
      } else if (wsRef.current.readyState === WebSocket.CONNECTING) {
        // Mark for cleanup once connected
        const ws = wsRef.current;
        ws.addEventListener("open", () => {
          ws.close();
        });
      }
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);

    // Remove from global tracker
    if (connectionKeyRef.current) {
      const keyToDelete = connectionKeyRef.current;
      setTimeout(() => {
        activeConnections.delete(keyToDelete);
      }, 100);
      connectionKeyRef.current = null;
    }
  }, []);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = {
        type: "input",
        data,
      };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendResize = useCallback((rows: number, cols: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: TerminalMessage = {
        type: "resize",
        data: "",
        rows,
        cols,
      };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !resourceId) {
      isConnectingRef.current = false;
      return;
    }

    const connectionKey = `terminal-${resourceId}-${container || "default"}-${shell}`;

    // Prevent duplicate connections
    if (isConnectingRef.current || activeConnections.has(connectionKey)) {
      return;
    }

    // Cleanup old connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    isConnectingRef.current = true;
    activeConnections.add(connectionKey);
    connectionKeyRef.current = connectionKey;

    // Build WebSocket URL
    const baseUrl = getApiBaseUrl();
    // Convert http(s) to ws(s)
    const wsBaseUrl = baseUrl.replace(/^http/, "ws");

    let url = `${wsBaseUrl}/resources/${resourceId}/exec/terminal?shell=${encodeURIComponent(shell)}`;
    if (container) {
      url += `&container=${encodeURIComponent(container)}`;
    }

    // Get token from store
    const token = useAuthStore.getState().token;

    if (!token) {
      setError("No authentication token found");
      isConnectingRef.current = false;
      activeConnections.delete(connectionKey);
      return;
    }

    try {
      // SECURITY WARNING: Sending token as URL query parameter is not ideal
      // WebSocket in browsers doesn't support custom headers, so we have limited options:
      // 1. URL query param (current - can be logged/cached)
      // 2. Sec-WebSocket-Protocol header (better but limited browser support)
      // 3. Backend should exchange token for short-lived, single-use ticket
      // TODO: Implement backend ticket exchange for better security
      url += `&token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        isConnectingRef.current = false;
        shouldReconnectRef.current = true;
      };

      ws.onmessage = event => {
        try {
          const msg: TerminalMessage = JSON.parse(event.data);

          switch (msg.type) {
            case "metadata":
              try {
                setMetadata(JSON.parse(msg.data));
              } catch {
                // Silent fail for metadata parsing
              }
              break;

            case "output":
              if (onOutput) {
                onOutput(msg.data);
              }
              break;

            case "error":
              setError(msg.data);
              setIsConnected(false);
              break;

            case "close":
              setIsConnected(false);
              if (onClose) {
                onClose(msg.data);
              }
              shouldReconnectRef.current = false;
              cleanup();
              break;
          }
        } catch (err) {
          console.error("Failed to parse terminal message:", err);
        }
      };

      ws.onerror = () => {
        setError("Connection error");
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        isConnectingRef.current = false;

        // Auto-reconnect if enabled and not intentionally closed
        if (enabled && shouldReconnectRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            isConnectingRef.current = false;
            connect();
          }, RECONNECT_DELAY_MS);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnected(false);
      isConnectingRef.current = false;
      activeConnections.delete(connectionKey);
    }
  }, [enabled, resourceId, container, shell, onOutput, onClose, cleanup]);

  const reconnect = useCallback(() => {
    setError(null);
    shouldReconnectRef.current = true;
    isConnectingRef.current = false;
    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    // Skip if not enabled
    if (!enabled) return;

    const connectionKey = `terminal-${resourceId}-${container || "default"}-${shell}`;

    // Prevent duplicate connections from StrictMode
    if (activeConnections.has(connectionKey)) {
      return;
    }

    // Start connection
    connect();

    // Cleanup on unmount
    return () => {
      shouldReconnectRef.current = false;
      cleanup();
      isConnectingRef.current = false;
      hasInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resourceId, container, shell]);

  return {
    isConnected,
    error,
    metadata,
    sendInput,
    sendResize,
    reconnect,
    disconnect,
  };
}
