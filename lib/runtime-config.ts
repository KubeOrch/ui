export interface PublicRuntimeConfig {
  apiUrl: string;
}

declare global {
  interface Window {
    __KUBEORCH_RUNTIME_CONFIG__?: PublicRuntimeConfig;
  }
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("NEXT_PUBLIC_API_URL must not be empty");
  }

  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) {
      throw new Error("NEXT_PUBLIC_API_URL must not be protocol-relative");
    }

    const parsed = new URL(trimmed, "http://runtime.invalid");
    if (parsed.search || parsed.hash) {
      throw new Error(
        "NEXT_PUBLIC_API_URL must not include a query or fragment"
      );
    }

    return parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be an absolute HTTP(S) URL or a same-origin path"
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("NEXT_PUBLIC_API_URL must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("NEXT_PUBLIC_API_URL must not include credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_API_URL must not include a query or fragment");
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    throw new Error(
      "The browser API URL is unavailable during server rendering"
    );
  }

  const apiUrl = window.__KUBEORCH_RUNTIME_CONFIG__?.apiUrl;
  if (apiUrl === undefined) {
    throw new Error("KubeOrch runtime configuration was not initialized");
  }

  return apiUrl;
}
