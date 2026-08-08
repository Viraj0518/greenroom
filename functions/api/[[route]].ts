// Maintainer bootstrap placeholder — backend (tenzinyeshi-34) owns functions/ and should replace this.
// Contract: single catch-all route delegating to the Hono app in functions/src/.
import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";

type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  APP_BASE_URL: string;
};

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "greenroom" }));

export const onRequest = handle(app);
