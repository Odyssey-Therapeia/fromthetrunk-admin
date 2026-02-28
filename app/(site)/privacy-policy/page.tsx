import type { Metadata } from "next";

import { ScrollReveal } from "@/components/animations/scroll-reveal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How From the Trunk collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Legal</p>
        <h1 className="font-serif text-4xl text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: February 2026</p>
      </ScrollReveal>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">1. Information We Collect</h2>
          <p>When you use From the Trunk, we may collect the following information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong className="text-foreground">Account information:</strong> Name, email address, phone number when you create an account or sign in via Google, Microsoft, or X.</li>
            <li><strong className="text-foreground">Shipping information:</strong> Delivery addresses you provide during checkout.</li>
            <li><strong className="text-foreground">Payment information:</strong> Payment is processed securely by Razorpay. We do not store your card details.</li>
            <li><strong className="text-foreground">Usage data:</strong> Pages viewed, interactions with the site, and device information to improve our services.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To process and fulfill your orders.</li>
            <li>To communicate about your orders, account, and new collections.</li>
            <li>To improve our products, services, and user experience.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">3. Data Sharing</h2>
          <p>We do not sell your personal information. We share data only with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Payment processors (Razorpay) to process transactions.</li>
            <li>Shipping carriers to deliver your orders.</li>
            <li>Email service providers to send transactional and marketing communications.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">4. Data Security</h2>
          <p>We implement appropriate technical and organisational measures to protect your personal data, including encryption of data in transit (HTTPS) and secure storage practices.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">5. Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal data. Contact us at <a href="mailto:hello@fromthetrunk.com" className="text-primary underline">hello@fromthetrunk.com</a> to exercise these rights.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">6. Cookies</h2>
          <p>We use essential cookies for authentication, cart functionality, and site operation. We do not use third-party tracking cookies without your consent.</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-foreground">7. Contact Us</h2>
          <p>If you have questions about this policy, please contact us at <a href="mailto:hello@fromthetrunk.com" className="text-primary underline">hello@fromthetrunk.com</a>.</p>
        </section>
      </div>
    </div>
  );
}
