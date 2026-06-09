import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { serveStaticFile, serveStaticFileHead } from "./staticFiles";

async function makeRoot() {
  return mkdtemp(path.join(os.tmpdir(), "deepstake-static-"));
}

describe("static file helpers", () => {
  it("serves files with content headers", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, "widget.js"), "console.log('ok');");

    const response = await serveStaticFile({ params: { path: ["widget.js"] } }, root);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("serves HEAD metadata without a body", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, "image.png"), "png");

    const response = await serveStaticFileHead({ params: { path: ["image.png"] } }, root);

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("rejects missing paths, directories, invalid segments, and traversal", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, "dir"));

    expect((await serveStaticFile({ params: { path: [] } }, root)).status).toBe(404);
    expect((await serveStaticFile({ params: { path: ["dir"] } }, root)).status).toBe(404);
    expect((await serveStaticFile({ params: { path: [""] } }, root)).status).toBe(400);
    expect((await serveStaticFile({ params: { path: ["..", "secret.txt"] } }, root)).status).toBe(403);
    expect((await serveStaticFile({ params: { path: ["missing.txt"] } }, root)).status).toBe(404);
  });
});
