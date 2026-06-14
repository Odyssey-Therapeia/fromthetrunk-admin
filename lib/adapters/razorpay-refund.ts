/**
 * P6-05: Razorpay refund adapter.
 *
 * Implements PaymentsPort.refund() by calling the Razorpay payments.refund API.
 * Fixture-tested: getRazorpayInstance is stubbed in tests; no live Razorpay calls.
 */

import { getRazorpayInstance } from "@/lib/payments/razorpay";
import type { PaymentsPort, RefundInput, RefundResult } from "@/lib/ports/payments";

export function createRazorpayRefundAdapter(): PaymentsPort {
  return {
    async refund({ paymentId, amountPaise }: RefundInput): Promise<RefundResult> {
      if (!paymentId) {
        throw new Error("refund: paymentId is required");
      }

      const razorpay = getRazorpayInstance();

      // Razorpay payments.refund(paymentId, { amount? }) — amount is optional for full refund.
      // https://razorpay.com/docs/api/refunds/create/
      const body: Record<string, unknown> = {};
      if (amountPaise !== undefined) {
        body.amount = amountPaise;
      }

      const response = await razorpay.payments.refund(paymentId, body as Parameters<typeof razorpay.payments.refund>[1]);

      const refundRecord = response as unknown as { id: string; amount: number };

      return {
        refundId: refundRecord.id,
        amountPaise: refundRecord.amount,
      };
    },
  };
}
