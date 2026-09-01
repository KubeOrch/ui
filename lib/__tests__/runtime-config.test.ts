import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl, normalizeApiBaseUrl } from "@/lib/runtime-config";
import {
  loadPublicRuntimeConfig,
  serializePublicRuntimeConfig,
} from "@/lib/runtime-config.server";
import { GET as getRuntimeConfigScript } from "@/app/runtime-config.js/route";

describe("runtime configuration", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.__KUBEORCH_RUNTIME_CONFIG__;
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  });

  it("normalizes absolute and same-origin API URLs", () => {
    expect(normalizeApiBaseUrl(" https://core.example/v1/api/ ")).toBe(
      "https://core.example/v1/api"
    );
    expect(normalizeApiBaseUrl("/v1/api/")).toBe("/v1/api");
    expect(normalizeApiBaseUrl("/")).toBe("");
  });

  it.each([
    "",
    "core.example/v1/api",
    "//core.example/v1/api",
    "ftp://core.example/v1/api",
    "https://user:secret@core.example/v1/api",
    "https://core.example/v1/api?token=secret",
    "https://core.example/v1/api#fragment",
    "/\\core.example/v1/api",
    "/foo\\bar",
    "https://core.example/v1/api\nheader",
  ])("rejects an unsafe API URL: %s", value => {
    expect(() => normalizeApiBaseUrl(value)).toThrow();
  });

  it("requires the API URL at server runtime", () => {
    expect(() => loadPublicRuntimeConfig({})).toThrow(
      "NEXT_PUBLIC_API_URL must be configured"
    );
    expect(
      loadPublicRuntimeConfig({
        NEXT_PUBLIC_API_URL: "http://localhost:3000/v1/api/",
      })
    ).toEqual({ apiUrl: "http://localhost:3000/v1/api" });
  });

  it("serializes configuration without executable markup", () => {
    const script = serializePublicRuntimeConfig({
      apiUrl: "https://core.example/</script><script>alert(1)</script>",
    });

    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c/script>");
  });

  it("reads the injected browser configuration", () => {
    window.__KUBEORCH_RUNTIME_CONFIG__ = {
      apiUrl: "https://core.example/v1/api",
    };

    expect(getApiBaseUrl()).toBe("https://core.example/v1/api");
  });

  it("fails clearly before browser configuration is initialized", () => {
    expect(() => getApiBaseUrl()).toThrow(
      "KubeOrch runtime configuration was not initialized"
    );
  });

  it("serves runtime configuration without cacheable headers", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://runtime.example/v1/api/";

    const response = getRuntimeConfigScript();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.text()).toContain(
      '"apiUrl":"https://runtime.example/v1/api"'
    );
  });

  it("returns a failed initialization script for invalid configuration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.NEXT_PUBLIC_API_URL;

    const response = getRuntimeConfigScript();

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("runtime configuration is invalid");
  });
});
