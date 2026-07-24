type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;

function sanitize(value: LogValue): LogValue {
  if (typeof value !== "string") return value;
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

export function operationalLog(
  level: LogLevel,
  event: string,
  fields: Record<string, LogValue> = {}
): void {
  const entry = Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitize(value)])
  );
  const message = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...entry
  });

  // This is the single output boundary for structured operational events.
  // eslint-disable-next-line no-console
  console[level](message);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
