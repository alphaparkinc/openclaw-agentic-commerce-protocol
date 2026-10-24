/**
 * ACP End-to-End Integration Test Suite
 * Spins up local mock merchant server, runs full HTTP-based ACP flow with real network requests,
 * and asserts contract compliance.
 */

const assert = require('assert');
const server = require('./mock_merchant_server');
const ACPClient = require('./acp_client');

const TEST_PORT = 8999;

async function runTests() {
  console.log('--- Starting Agentic Commerce Protocol (ACP) E2E Test Suite ---');

  // 1. Start Server
  await new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`[PASS] Mock Merchant Server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  try {
    const client = new ACPClient({
      baseUrl: `http://127.0.0.1:${TEST_PORT}`,
      merchantId: 'acct_test_merchant_777',
      useMock: false
    });

    // 2. Test Negotiation Endpoint
    console.log('\n[1/4] Testing /api/acp/negotiate ...');
    const negotiation = await client.negotiate({
      cartId: 'cart_unit_test_001',
      lineItems: [
        { sku: 'PREM-SMART-SPEAKER', quantity: 2, unit_price: 79.99, title: 'Smart Audio Hub' }
      ],
      shippingAddress: {
        name: 'Alex Johnson',
        line1: '789 Innovation Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        country: 'US'
      },
      promoCode: 'SAVE10'
    });

    assert(negotiation.session_id, 'Negotiation must return session_id');
    assert.strictEqual(negotiation.currency, 'usd', 'Currency must be USD');
    assert(negotiation.total_amount > 0, 'Total amount must be greater than 0');
    assert(Array.isArray(negotiation.shipping_options) && negotiation.shipping_options.length > 0, 'Must provide shipping options');
    console.log(`[PASS] Negotiated Session ID: ${negotiation.session_id}`);
    console.log(`       Subtotal: $${negotiation.subtotal}, Discount: -$${negotiation.discount_amount}, Tax: $${negotiation.tax}, Total: $${negotiation.total_amount}`);

    // 3. Test Scoped Stripe Payment Token (SPT) Minting
    console.log('\n[2/4] Testing Stripe Payment Token (SPT) delegation ...');
    const paymentToken = await client.mintStripePaymentToken({
      maxAmount: negotiation.total_amount,
      currency: negotiation.currency,
      customerConsent: true
    });

    assert.strictEqual(paymentToken.type, 'stripe_payment_token');
    assert(paymentToken.token.startsWith('spt_test_'), 'Token should have spt_test_ prefix');
    assert.strictEqual(paymentToken.max_amount, negotiation.total_amount);
    console.log(`[PASS] Minted Scoped Token: ${paymentToken.token} (Cap: $${paymentToken.max_amount})`);

    // 4. Test Checkout Session Completion
    console.log('\n[3/4] Testing /api/acp/checkout_sessions ...');
    const idempotencyKey = 'idem_test_abc123';
    const checkout = await client.createCheckoutSession({
      sessionId: negotiation.session_id,
      selectedShippingId: negotiation.selected_shipping_id,
      paymentToken: paymentToken,
      idempotencyKey: idempotencyKey
    });

    assert.strictEqual(checkout.status, 'PLACED', 'Order status must be PLACED');
    assert(checkout.order_id, 'Must return order_id');
    assert(checkout.fulfillment.tracking_number, 'Must return carrier tracking number');
    console.log(`[PASS] Order Placed: ${checkout.order_id}`);
    console.log(`       Tracking: ${checkout.fulfillment.carrier} ${checkout.fulfillment.tracking_number}`);

    // Test Idempotency Guard
    console.log('       Verifying idempotency protection ...');
    const duplicateCheckout = await client.createCheckoutSession({
      sessionId: negotiation.session_id,
      selectedShippingId: negotiation.selected_shipping_id,
      paymentToken: paymentToken,
      idempotencyKey: idempotencyKey
    });
    assert.strictEqual(duplicateCheckout.order_id, checkout.order_id, 'Duplicate idempotency call must return matching order');
    console.log('[PASS] Idempotency successfully prevented duplicate charge.');

    // 5. Test Fulfillment Tracking
    console.log('\n[4/4] Testing /api/acp/orders/:id query ...');
    const orderDetails = await client.getOrderStatus(checkout.order_id);
    assert.strictEqual(orderDetails.order_id, checkout.order_id);
    assert.strictEqual(orderDetails.status, 'PLACED');
    console.log(`[PASS] Verified order status retrieval for ${checkout.order_id}`);

    console.log('\n======================================================');
    console.log('ALL TESTS PASSED! Agentic Commerce Protocol (ACP) verified.');
    console.log('======================================================');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n[FAIL] Test suite failed with error:', err);
  if (server.listening) server.close();
  process.exit(1);
});
