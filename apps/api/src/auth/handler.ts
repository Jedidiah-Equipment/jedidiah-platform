import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { auth } from "./auth.js";

function createHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.append(key, String(value));
    }
  }

  return headers;
}

function createBody(request: FastifyRequest): string | undefined {
  if (request.method === "GET" || request.method === "HEAD" || request.body === undefined) {
    return undefined;
  }

  if (typeof request.body === "string") {
    return request.body;
  }

  return JSON.stringify(request.body);
}

async function handleAuthRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const body = createBody(request);
    const response = await auth.handler(
      new Request(url.toString(), {
        method: request.method,
        headers: createHeaders(request),
        ...(body === undefined ? {} : { body }),
      }),
    );

    reply.status(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    reply.send(response.body ? await response.text() : null);
  } catch (error) {
    request.log.error({ error }, "Authentication request failed");
    reply.status(500).send({
      error: "Internal authentication error",
      code: "AUTH_FAILURE",
    });
  }
}

export async function registerAuthHandler(app: FastifyInstance): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: handleAuthRequest,
  });
}
