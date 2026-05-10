import { createReadStream } from "fs";
import { realpath, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

export type StaticFileRouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function getRequestedFile(context: StaticFileRouteContext, configuredRoot: string) {
  const { path: requestedPath = [] } = await Promise.resolve(context.params);
  if (requestedPath.length === 0) {
    return { error: new Response("Not found", { status: 404 }) };
  }

  if (requestedPath.some((segment) => segment === "" || segment.includes("\0"))) {
    return { error: new Response("Bad request", { status: 400 }) };
  }

  const root = path.resolve(configuredRoot);
  const target = path.resolve(root, ...requestedPath);

  if (!isInsideRoot(root, target)) {
    return { error: new Response("Forbidden", { status: 403 }) };
  }

  try {
    const fileStat = await stat(target);
    if (!fileStat.isFile()) {
      return { error: new Response("Not found", { status: 404 }) };
    }

    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!isInsideRoot(realRoot, realTarget)) {
      return { error: new Response("Forbidden", { status: 403 }) };
    }

    return {
      file: {
        path: target,
        size: fileStat.size,
        contentType: CONTENT_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
      },
    };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { error: new Response("Not found", { status: 404 }) };
    }
    if (code === "EACCES" || code === "EPERM") {
      return { error: new Response("Forbidden", { status: 403 }) };
    }
    console.error("Static file server error:", error);
    return { error: new Response("Internal server error", { status: 500 }) };
  }
}

function fileHeaders(file: { size: number; contentType: string }) {
  return {
    "Cache-Control": "no-store",
    "Content-Length": file.size.toString(),
    "Content-Type": file.contentType,
    "X-Content-Type-Options": "nosniff",
  };
}

export async function serveStaticFile(context: StaticFileRouteContext, root: string) {
  const result = await getRequestedFile(context, root);
  if (result.error) return result.error;

  const stream = Readable.toWeb(createReadStream(result.file.path));
  return new Response(stream as ReadableStream, {
    headers: fileHeaders(result.file),
  });
}

export async function serveStaticFileHead(context: StaticFileRouteContext, root: string) {
  const result = await getRequestedFile(context, root);
  if (result.error) return result.error;

  return new Response(null, {
    headers: fileHeaders(result.file),
  });
}
