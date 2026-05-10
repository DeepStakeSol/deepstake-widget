import { type NextRequest } from "next/server";
import {
  serveStaticFile,
  serveStaticFileHead,
  type StaticFileRouteContext
} from "@/utils/fileserver/staticFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: StaticFileRouteContext) {
  return serveStaticFile(context, process.env.IMAGES_DIR || "/images");
}

export async function HEAD(_request: NextRequest, context: StaticFileRouteContext) {
  return serveStaticFileHead(context, process.env.IMAGES_DIR || "/images");
}
