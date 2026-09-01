import { chromium } from "playwright";

const [uiUrl, apiUrl] = process.argv.slice(2);

if (!uiUrl || !apiUrl) {
  throw new Error("usage: node smoke-browser.mjs <ui-url> <api-url>");
}

const expectedRequestUrl = `${apiUrl}/auth/methods`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const apiResponsePromise = page.waitForResponse(
    response =>
      response.url() === expectedRequestUrl &&
      response.request().method() === "GET",
    { timeout: 30_000 }
  );

  await page.goto(`${uiUrl}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  const apiResponse = await apiResponsePromise;
  if (!apiResponse.ok()) {
    throw new Error(
      `Configured Core request returned HTTP ${apiResponse.status()}`
    );
  }

  const runtimeApiUrl = await page.evaluate(
    () => window.__KUBEORCH_RUNTIME_CONFIG__?.apiUrl
  );
  if (runtimeApiUrl !== apiUrl) {
    throw new Error(
      `Browser received API URL ${runtimeApiUrl ?? "<missing>"}; expected ${apiUrl}`
    );
  }

  await page.getByText("Welcome back", { exact: true }).waitFor();
  console.log(`Browser requested ${expectedRequestUrl}`);
} finally {
  await browser.close();
}
