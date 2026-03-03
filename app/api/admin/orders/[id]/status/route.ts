import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

/**
 * PATCH /api/admin/orders/[id]/status
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await Promise.resolve(params);
  const response = await forwardToV2(request, `/admin/orders/${id}/status`, {
    preserveSearch: false,
  });
  return passThroughJson(response);
}
