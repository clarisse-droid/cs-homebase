import "server-only";
import { parse, type OperationDefinitionNode } from "graphql";

/**
 * Read-only monday.com GraphQL client.
 *
 * Protection layers (defence in depth — the AI is never the control):
 *  1. Use a token from a dedicated monday.com Viewer-level user (see docs/SETUP.md).
 *  2. This module parses every document and refuses anything that is not a `query` operation.
 *  3. It is the ONLY module that talks to monday.com, it has no "mutate" function, and it is server-only.
 */

export class MondayWriteBlockedError extends Error {
  constructor(op: string) {
    super(`Blocked: monday.com integration is read-only (attempted '${op}' operation).`);
    this.name = "MondayWriteBlockedError";
  }
}

export function assertReadOnly(document: string): void {
  let ast;
  try {
    ast = parse(document);
  } catch (e) {
    throw new Error(`Invalid GraphQL document: ${(e as Error).message}`);
  }
  for (const def of ast.definitions) {
    if (def.kind !== "OperationDefinition") {
      if (def.kind === "FragmentDefinition") continue;
      throw new MondayWriteBlockedError(def.kind);
    }
    const op = (def as OperationDefinitionNode).operation;
    if (op !== "query") throw new MondayWriteBlockedError(op);
  }
}

export interface MondayClientOptions {
  token: string;
  endpoint?: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class MondayReadClient {
  private token: string;
  private endpoint: string;
  private maxRetries: number;
  private fetchImpl: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  public requestCount = 0;

  constructor(opts: MondayClientOptions) {
    if (!opts.token) throw new Error("MONDAY_API_TOKEN is not set");
    this.token = opts.token;
    this.endpoint = opts.endpoint ?? "https://api.monday.com/v2";
    this.maxRetries = opts.maxRetries ?? 5;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async query<T = unknown>(document: string, variables: Record<string, unknown> = {}): Promise<T> {
    assertReadOnly(document);
    let attempt = 0;
    for (;;) {
      attempt++;
      this.requestCount++;
      let res: Response;
      try {
        res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: this.token, "API-Version": "2025-04" },
          body: JSON.stringify({ query: document, variables }),
        });
      } catch (e) {
        if (attempt > this.maxRetries) throw e;
        await this.sleep(backoff(attempt));
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt > this.maxRetries) throw new Error(`monday.com HTTP ${res.status} after ${attempt} attempts`);
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string; retry_in_seconds?: number } }[]; error_message?: string };
      const errs = body.errors ?? (body.error_message ? [{ message: body.error_message }] : []);
      if (errs.length) {
        const retriable = errs.find((e) => /complexity|rate limit|ComplexityException|maxConcurrency/i.test(e.message + (e.extensions?.code ?? "")));
        if (retriable && attempt <= this.maxRetries) {
          await this.sleep((retriable.extensions?.retry_in_seconds ?? 0) * 1000 || backoff(attempt));
          continue;
        }
        throw new Error(`monday.com error: ${errs.map((e) => e.message).join("; ")}`);
      }
      if (!res.ok) throw new Error(`monday.com HTTP ${res.status}`);
      return body.data as T;
    }
  }
}

function backoff(attempt: number) {
  return Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}
