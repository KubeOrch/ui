import {
  normalizeApiBaseUrl,
  type PublicRuntimeConfig,
} from "@/lib/runtime-config";

export function loadPublicRuntimeConfig(
  env: Record<string, string | undefined> = process.env
): PublicRuntimeConfig {
  const apiUrl = env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be configured when the UI server starts"
    );
  }

  return { apiUrl: normalizeApiBaseUrl(apiUrl) };
}

export function serializePublicRuntimeConfig(
  config: PublicRuntimeConfig
): string {
  const serialized = JSON.stringify(config)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return `window.__KUBEORCH_RUNTIME_CONFIG__=Object.freeze(${serialized});`;
}
