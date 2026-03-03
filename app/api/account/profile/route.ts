import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

const mapLegacyProfile = (value: unknown) => {
  if (!value || typeof value !== "object") return value;
  const user = value as Record<string, unknown>;
  const defaultAddress =
    (user.defaultAddress as Record<string, unknown> | null)?.id ??
    user.defaultAddressId ??
    null;

  return {
    ...user,
    defaultAddress,
  };
};

export async function GET(request: Request) {
  const response = await forwardToV2(request, "/users/me");
  return passThroughJson(response, mapLegacyProfile);
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const payload =
    body && typeof body === "object"
      ? {
          ...(body as Record<string, unknown>),
          defaultAddressId:
            (body as Record<string, unknown>).defaultAddress ?? undefined,
        }
      : body;

  if (payload && typeof payload === "object") {
    delete (payload as Record<string, unknown>).defaultAddress;
  }

  const response = await forwardToV2(request, "/users/me", {
    ...(payload && typeof payload === "object"
      ? { body: payload as Record<string, unknown> }
      : {}),
    preserveSearch: false,
  });
  return passThroughJson(response, mapLegacyProfile);
}
