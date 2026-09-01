import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";
import { useNotificationStore } from "@/stores/NotificationStore";
import type { Notification } from "@/lib/services/notification";

const RECONNECT_DELAY_MS = 3000;

export function useNotificationSSE() {
  const token = useAuthStore(state => state.token);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const addRealtimeNotification = useNotificationStore(
    state => state.addRealtimeNotification
  );
  const streamRef = useRef<{ close: () => void } | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isConnectingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(async () => {
    if (!isAuthenticated || !token || isConnectingRef.current) {
      return;
    }

    const apiUrl = getApiBaseUrl();

    isConnectingRef.current = true;

    const url = `${apiUrl}/user-notifications/stream`;

    try {
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

      isConnectingRef.current = false;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      streamRef.current = {
        close: () => {
          reader.cancel();
        },
      };

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;

              const eventMatch = line.match(/^event:\s*(.+)$/m);
              const dataMatch = line.match(/^data:\s*(.+)$/m);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = dataMatch[1];

                if (eventType === "new_notification") {
                  try {
                    const notification: Notification = JSON.parse(data);
                    addRealtimeNotification(notification);
                  } catch {
                    // ignore parse errors
                  }
                }
              }
            }
          }
        } catch {
          // stream ended or errored
        }

        // Auto-reconnect
        streamRef.current = null;
        if (isAuthenticated && token) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY_MS);
        }
      };

      processStream();
    } catch {
      isConnectingRef.current = false;

      // Auto-reconnect on connection failure
      if (isAuthenticated && token) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      }
    }
  }, [isAuthenticated, token, addRealtimeNotification]);

  useEffect(() => {
    if (isAuthenticated && token) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [isAuthenticated, token, connect, cleanup]);
}
