import {
  loadPublicRuntimeConfig,
  serializePublicRuntimeConfig,
} from "@/lib/runtime-config.server";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/javascript; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export function GET(): Response {
  try {
    return new Response(
      serializePublicRuntimeConfig(loadPublicRuntimeConfig()),
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error("Invalid UI runtime configuration", error);
    return new Response(
      'throw new Error("KubeOrch UI runtime configuration is invalid");',
      { status: 500, headers: responseHeaders }
    );
  }
}
