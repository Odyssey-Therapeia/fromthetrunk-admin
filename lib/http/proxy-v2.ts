import { NextResponse } from "next/server";

type ForwardOptions = {
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  method?: string;
  preserveSearch?: boolean;
};

const isBodyMethod = (method: string) => method !== "GET" && method !== "HEAD";

const buildHeaders = (request: Request, headers?: HeadersInit) => {
  const nextHeaders = new Headers(headers ?? request.headers);
  nextHeaders.delete("content-length");
  nextHeaders.delete("host");
  return nextHeaders;
};

const withBody = async (
  request: Request,
  method: string,
  optionsBody: ForwardOptions["body"],
  headers: Headers
): Promise<BodyInit | undefined> => {
  if (!isBodyMethod(method)) return undefined;
  if (optionsBody === undefined) {
    return await request.text();
  }
  if (typeof optionsBody === "string" || optionsBody instanceof FormData) {
    return optionsBody;
  }
  if (optionsBody instanceof URLSearchParams || optionsBody instanceof Blob) {
    return optionsBody;
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return JSON.stringify(optionsBody);
};

export const forwardToV2 = async (
  request: Request,
  path: string,
  options: ForwardOptions = {}
) => {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/v2${path}`, sourceUrl.origin);
  if (options.preserveSearch !== false) {
    targetUrl.search = sourceUrl.search;
  }

  const method = options.method ?? request.method;
  const headers = buildHeaders(request, options.headers);
  const body = await withBody(request, method, options.body, headers);

  return fetch(targetUrl, {
    body,
    headers,
    method,
    redirect: "manual",
  });
};

export const passThroughJson = async (
  response: Response,
  mapBody?: (value: unknown) => unknown
) => {
  const text = await response.text();
  if (!text) {
    return new NextResponse(null, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  const parsed = JSON.parse(text) as unknown;
  const body = mapBody ? mapBody(parsed) : parsed;

  return NextResponse.json(body, {
    status: response.status,
    statusText: response.statusText,
  });
};
