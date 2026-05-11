import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyReply } from "fastify";
import Fastify from "fastify";
import { getPublicEnvConfig } from "../lib/env.js";

const port = Number(process.env.PORT ?? 5173);
const distDir = join(process.cwd(), "dist");

function publicConfigScript(): string {
  const serializedConfig = JSON.stringify(getPublicEnvConfig()).replace(/</g, "\\u003c");

  return `window.__APP_CONFIG__ = ${serializedConfig};`;
}

async function sendIndexHtml(reply: FastifyReply): Promise<void> {
  const index = await readFile(join(distDir, "index.html"), "utf8");
  const configScript = `<script>${publicConfigScript()}</script>`;
  const html = index.includes("</head>")
    ? index.replace("</head>", `    ${configScript}\n  </head>`)
    : `${configScript}\n${index}`;

  reply.header("Cache-Control", "no-store");
  reply.type("text/html; charset=utf-8");
  reply.send(html);
}

const app = Fastify();

await app.register(fastifyStatic, {
  prefix: "/__static__/",
  root: distDir,
  wildcard: false,
});

app.get("/assets/*", (request, reply) => {
  const { "*": assetPath } = request.params as { "*": string };

  return reply.sendFile(`assets/${assetPath}`, { immutable: true, maxAge: "1y" });
});

app.get("/*", async (request, reply) => {
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (pathname !== "/" && extname(pathname) !== "") {
    return reply.sendFile(pathname.slice(1));
  }

  return sendIndexHtml(reply);
});

await app.listen({ host: "0.0.0.0", port });
console.info(`Web server listening on port ${port}`);

process.on("SIGTERM", () => {
  app.close().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
});

process.on("SIGINT", () => {
  app.close().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
});
