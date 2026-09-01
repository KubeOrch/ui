import { createServer } from "node:http";

const port = Number.parseInt(process.argv[2] ?? "", 10);
const allowedOrigin = process.argv[3];

if (!Number.isInteger(port) || port < 1 || !allowedOrigin) {
  throw new Error("usage: node mock-core.mjs <port> <allowed-origin>");
}

const server = createServer((request, response) => {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host}`
  );

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname === "/v1/api/auth/methods"
  ) {
    console.log(`${request.method} ${requestUrl.pathname}`);
    response.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        builtin: { enabled: true, signupEnabled: true },
        providers: [],
      })
    );
    return;
  }

  console.error(`Unexpected request: ${request.method} ${requestUrl.pathname}`);
  response.writeHead(404).end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Core listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
