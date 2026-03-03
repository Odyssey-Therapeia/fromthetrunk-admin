import { NextRequest, NextResponse } from "next/server";

import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

type V2Order = {
  id: string;
  items: Array<{
    imageUrl: null | string;
    name: string;
    pricePaise: number;
    productId: null | string;
    quantity: number;
  }>;
  paymentGateway: null | string;
  paymentId: null | string;
  paymentMethod: null | string;
  paymentStatus: string;
  placedAt: string;
  razorpayOrderId: null | string;
  shippingCity: null | string;
  shippingCostPaise: number;
  shippingCountry: null | string;
  shippingEmail: null | string;
  shippingLine1: null | string;
  shippingLine2: null | string;
  shippingName: null | string;
  shippingPhone: null | string;
  shippingPostalCode: null | string;
  shippingState: null | string;
  shippingMethod: null | string;
  status: string;
  subtotalPaise: number;
  taxAmountPaise: number;
  taxRate: string;
  totalPaise: number;
  userId: string;
};

const mapLegacyOrder = (order: V2Order) => ({
  id: order.id,
  items: order.items.map((item) => ({
    imageUrl: item.imageUrl,
    name: item.name,
    price: item.pricePaise / 100,
    product: item.productId,
    quantity: item.quantity,
  })),
  paymentGateway: order.paymentGateway,
  paymentId: order.paymentId,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  placedAt: order.placedAt,
  razorpayOrderId: order.razorpayOrderId,
  shippingAddress: {
    city: order.shippingCity,
    country: order.shippingCountry,
    email: order.shippingEmail,
    line1: order.shippingLine1,
    line2: order.shippingLine2,
    name: order.shippingName,
    phone: order.shippingPhone,
    postalCode: order.shippingPostalCode,
    state: order.shippingState,
  },
  shippingCost: order.shippingCostPaise / 100,
  shippingMethod: order.shippingMethod ?? null,
  status: order.status,
  subtotal: order.subtotalPaise / 100,
  taxAmount: order.taxAmountPaise / 100,
  taxRate: Number(order.taxRate),
  total: order.totalPaise / 100,
  user: order.userId,
});

/**
 * GET /api/account/orders          — list all orders for the current user
 * GET /api/account/orders?orderId=X — fetch a single order by ID (ownership-checked)
 */
export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (orderId) {
    const response = await forwardToV2(request, `/orders/${orderId}`, {
      preserveSearch: false,
    });
    return passThroughJson(response, (value) => {
      if (!response.ok || !value || typeof value !== "object") {
        return value;
      }
      return {
        order: mapLegacyOrder(value as V2Order),
      };
    });
  }

  const response = await forwardToV2(request, "/orders", {
    preserveSearch: false,
  });
  return passThroughJson(response, (value) => {
    if (!response.ok || !Array.isArray(value)) {
      return value;
    }
    return {
      orders: value.map((order) => mapLegacyOrder(order as V2Order)),
    };
  });
}
