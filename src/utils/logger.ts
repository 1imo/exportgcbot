type Meta = Record<string, unknown> | undefined;

export class Logger {
  private log(level: string, message: string, meta?: Meta): void {
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta ?? {})
    };
    // Keep output JSON-like for easy ingestion.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }

  info(message: string, meta?: Meta): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Meta): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Meta): void {
    this.log("error", message, meta);
  }

  debug(message: string, meta?: Meta): void {
    this.log("debug", message, meta);
  }
}
