/**
 * P6-05: Payments port — refund capability.
 *
 * Defines the interface for payment refunds.
 * The concrete adapter is selected by getPaymentsPort() below.
 * Tests fixture-stub the adapter — live Razorpay is never called in tests.
 */

// ── Port interface ────────────────────────────────────────────────────────────

export type RefundInput = {
  /** The Razorpay payment ID (pay_xxx) to refund. */
  paymentId: string;
  /** Amount to refund in paise. If omitted, full order amount is refunded. */
  amountPaise?: number;
};

export type RefundResult = {
  /** The Razorpay refund ID (rfnd_xxx). */
  refundId: string;
  /** Amount refunded in paise. */
  amountPaise: number;
};

export interface PaymentsPort {
  refund(input: RefundInput): Promise<RefundResult>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

import { createRazorpayRefundAdapter } from "@/lib/adapters/razorpay-refund";

let _instance: PaymentsPort | null = null;

/**
 * Returns the singleton payments adapter.
 * Currently: always the Razorpay adapter.
 */
export function getPaymentsPort(): PaymentsPort {
  if (_instance) return _instance;
  _instance = createRazorpayRefundAdapter();
  return _instance;
}

/**
 * Reset the singleton (test helper — do NOT call in production code).
 */
export function _resetPaymentsPortInstance(): void {
  _instance = null;
}
