import axios from "axios";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/AuthStore";
import { getApiBaseUrl } from "@/lib/runtime-config";

const api = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Flag to prevent multiple redirects and refresh loops
let isRedirecting = false;
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

api.interceptors.request.use(
  async config => {
    config.baseURL ??= getApiBaseUrl();

    // Skip token for auth endpoints
    if (config.url?.includes("/auth/")) {
      return config;
    }

    const authStore = useAuthStore.getState();
    const token = authStore.token;

    // Check if token exists and is expired
    if (token && authStore.isTokenExpired()) {
      // If we're not already refreshing, start the refresh process
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = api
          .post(
            "/auth/refresh",
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )
          .then(response => {
            const newToken = response.data.token;
            const user = response.data.user;
            authStore.setAuthDetails(newToken, user);
            isRefreshing = false;
            refreshPromise = null;
            return newToken;
          })
          .catch(error => {
            console.error("Failed to refresh token:", error);
            authStore.removeAuthDetails();
            isRefreshing = false;
            refreshPromise = null;
            throw error;
          });
      }

      // Wait for the refresh to complete
      if (refreshPromise) {
        try {
          const newToken = await refreshPromise;
          config.headers.Authorization = `Bearer ${newToken}`;
        } catch {
          // Refresh failed, reject the request
          return Promise.reject(new Error("Token refresh failed"));
        }
      }
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;
      const authStore = useAuthStore.getState();
      authStore.removeAuthDetails();

      toast.error("Session expired. Please login again.");

      // Use Next.js router via dynamic import to avoid SSR issues
      if (typeof window !== "undefined") {
        import("next/navigation").then(({ redirect }) => {
          redirect("/login");
        });
      }

      // Reset flag after a delay
      setTimeout(() => {
        isRedirecting = false;
      }, 1000);
    }
    return Promise.reject(error);
  }
);

export default api;
