import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

const resolveParams = async (params: Promise<{ id: string }> | { id: string }) =>
  await Promise.resolve(params);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await resolveParams(params);
  const response = await forwardToV2(request, `/addresses/${id}`);
  return passThroughJson(response, (value) => {
    if (!response.ok) return value;
    return { address: value };
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await resolveParams(params);
  const response = await forwardToV2(request, `/addresses/${id}`, {
    method: "DELETE",
    preserveSearch: false,
  });
  return passThroughJson(response, (value) => {
    if (!response.ok) return value;
    return { success: true };
  });
}
