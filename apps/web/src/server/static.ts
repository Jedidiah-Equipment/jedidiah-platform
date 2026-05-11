import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 5173);
const distDir = join(process.cwd(), "dist");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function publicConfigScript(): string {
  return `window.__APP_CONFIG__ = ${JSON.stringify({
    appEnv: process.env.PUBLIC_APP_ENV ?? "production",
    appBaseUrl: process.env.PUBLIC_APP_BASE_URL,
    apiBaseUrl: process.env.PUBLIC_API_BASE_URL,
    authBaseUrl: process.env.PUBLIC_AUTH_BASE_URL,
  })};`;
}

function safeFilePath(urlPath: string): string {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");

  return join(distDir, normalizedPath === "/" ? "index.html" : normalizedPath);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/env.js")) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/javascript; charset=utf-8",
      });
      response.end(publicConfigScript());
      return;
    }

    const filePath = safeFilePath(request.url ?? "/");
    const extension = extname(filePath);

    try {
      const file = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      });
      response.end(file);
    } catch {
      const index = await readFile(join(distDir, "index.html"));
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(index);
    }
  } catch {
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Internal server error");
  }
});

server.listen(port, () => {
  console.info(`Web server listening on port ${port}`);
});
