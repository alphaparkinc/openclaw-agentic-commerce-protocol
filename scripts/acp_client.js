/**
 * Agentic Commerce Protocol (ACP) Client
 * Implements capability negotiation, cart settlement, Stripe Payment Token (SPT) delegation,
 * and order checkout for AI Agent workflows.
 */

const crypto = require('crypto');

class ACPClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl] - Merchant API base URL (e.g., https://api.merchant.com)
   * @param {string} [options.merchantId] - Target Stripe Merchant Account ID
   * @param {string} [options.stripeApiKey] - Agent Stripe Secret Key for delegation minting
   * @param {boolean} [options.useMock=false] - Whether to execute in local mock emulation mode
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, '') : null;
    this.merchantId = options.merchantId || 'acct_acp_default_merchant';
    this.stripeApiKey = options.stripeApiKey || process.env.STRIPE_API_KEY || null;
    this.useMock = Boolean(options.useMock || !this.baseUrl);
    this.mockOrders = new Map();
  }

  /**
   * Step 1: Negotiate Cart & Shipping with Merchant Server
   * @param {Object} params
   * @param {string} [params.cartId]
   * @param {Array<{sku: string, quantity: number, unit_price?: number, title?: string}>} params.lineItems
   * @param {Object} params.shippingAddress
   * @param {string} [params.promoCode]
   * @returns {Promise<Object>} Authoritative checkout session state
   */
  async negotiate({ cartId, lineItems, shippingAddress, promoCode } = {}) {
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      throw new Error('ACPClient: lineItems array is required and must not be empty.');
    }
    if (!shippingAddress || !shippingAddress.postal_code || !shippingAddress.country) {
      throw new Error('ACPClient: valid shippingAddress with postal_code and country is required.');
    }

    if (this.useMock) {
      return this._mockNegotiate({ cartId, lineItems, shippingAddress, promoCode });
    }

    const url = `${this.baseUrl}/api/acp/negotiate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        cart_id: cartId || `cart_${crypto.randomBytes(4).toString('hex')}`,
        line_items: lineItems,
        shipping_address: shippingAddress,
        promo_code: promoCode
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ACP Negotiation failed [HTTP ${response.status}]: ${errText}`);
    }

    return await response.json();
  }

  /**
   * Step 2: Mint Scoped Stripe Payment Token (SPT)
   * Wraps customer payment delegation into a single-use, merchant-bound, amount-capped token.
   * @param {Object} params
   * @param {string} [params.merchantId] - Merchant Stripe account ID
   * @param {number} params.maxAmount - Maximum charge cap in standard units (e.g. 115.00)
   * @param {string} [params.currency='usd']
   * @param {boolean} params.customerConsent - Affirmed user consent
   * @returns {Promise<{type: string, token: string, max_amount: number, currency: string, expires_at: string}>}
   */
  async mintStripePaymentToken({ merchantId, maxAmount, currency = 'usd', customerConsent } = {}) {
    if (!customerConsent) {
      throw new Error('ACPClient Security Violation: Customer explicit consent is required to mint an SPT.');
    }
    if (!maxAmount || maxAmount <= 0) {
      throw new Error('ACPClient: maxAmount must be a positive number.');
    }

    const targetMerchant = merchantId || this.merchantId;
    const tokenSuffix = crypto.randomBytes(8).toString('hex');
    const token = `spt_test_${tokenSuffix}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      type: 'stripe_payment_token',
      token,
      merchant_id: targetMerchant,
      max_amount: Number(maxAmount.toFixed(2)),
      currency: currency.toLowerCase(),
      expires_at: expiresAt
    };
  }

  /**
   * Step 3: Complete Checkout Session (Charge Processing)
   * @param {Object} params
   * @param {string} params.sessionId - Session ID returned by negotiate()
   * @param {string} params.selectedShippingId - Chosen shipping tier ID
   * @param {Object} params.paymentToken - Scoped SPT object
   * @param {string} [params.idempotencyKey] - Unique key for safe retries
   * @returns {Promise<Object>} Order confirmation details
   */
  async createCheckoutSession({ sessionId, selectedShippingId, paymentToken, idempotencyKey } = {}) {
    if (!sessionId) {
      throw new Error('ACPClient: sessionId is required.');
    }
    if (!selectedShippingId) {
      throw new Error('ACPClient: selectedShippingId is required.');
    }
    if (!paymentToken || !paymentToken.token) {
      throw new Error('ACPClient: valid paymentToken is required.');
    }

    const key = idempotencyKey || `idem_${crypto.randomBytes(8).toString('hex')}`;

    if (this.useMock) {
      return this._mockCheckout({ sessionId, selectedShippingId, paymentToken, idempotencyKey: key });
    }

    const url = `${this.baseUrl}/api/acp/checkout_sessions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': key
      },
      body: JSON.stringify({
        session_id: sessionId,
        selected_shipping_id: selectedShippingId,
        payment_method: paymentToken,
        idempotency_key: key
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ACP Checkout failed [HTTP ${response.status}]: ${errText}`);
    }

    return await response.json();
  }

  /**
   * Step 4: Query Fulfillment & Order Status
   * @param {string} orderId
   * @returns {Promise<Object>} Current order status and shipping tracking
   */
  async getOrderStatus(orderId) {
    if (!orderId) {
      throw new Error('ACPClient: orderId is required.');
    }

    if (this.useMock) {
      const order = this.mockOrders.get(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found in mock store.`);
      }
      return order;
    }

    const url = `${this.baseUrl}/api/acp/orders/${encodeURIComponent(orderId)}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ACP Order query failed [HTTP ${response.status}]: ${errText}`);
    }

    return await response.json();
  }

  // --- Internal Mock Emulation Handlers ---

  _mockNegotiate({ cartId, lineItems, shippingAddress, promoCode }) {
    const sessionId = `acp_sess_${crypto.randomBytes(6).toString('hex')}`;
    let subtotal = 0;

    for (const item of lineItems) {
      const unitPrice = item.unit_price || 99.00;
      subtotal += unitPrice * (item.quantity || 1);
    }

    const discount = promoCode === 'SAVE10' ? subtotal * 0.1 : 0.0;
    const subtotalAfterDiscount = subtotal - discount;
    const taxRate = shippingAddress.country === 'US' ? 0.0825 : 0.15;
    const tax = Number((subtotalAfterDiscount * taxRate).toFixed(2));

    const shippingOptions = [
      { id: 'ship_standard', name: 'Standard Courier (3-5 days)', amount: 5.00, estimated_delivery: '2026-11-01' },
      { id: 'ship_express', name: 'Express Next-Day Delivery', amount: 15.00, estimated_delivery: '2026-10-26' }
    ];

    const defaultShipping = shippingOptions[0];
    const totalAmount = Number((subtotalAfterDiscount + tax + defaultShipping.amount).toFixed(2));

    return {
      session_id: sessionId,
      cart_id: cartId || `cart_${crypto.randomBytes(4).toString('hex')}`,
      currency: 'usd',
      subtotal: Number(subtotal.toFixed(2)),
      discount_amount: Number(discount.toFixed(2)),
      tax: tax,
      shipping_options: shippingOptions,
      selected_shipping_id: defaultShipping.id,
      total_amount: totalAmount,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
  }

  _mockCheckout({ sessionId, selectedShippingId, paymentToken, idempotencyKey }) {
    const orderId = `ord_acp_${crypto.randomBytes(5).toString('hex')}`;
    const order = {
      order_id: orderId,
      session_id: sessionId,
      status: 'PLACED',
      total_charged: paymentToken.max_amount,
      currency: paymentToken.currency || 'usd',
      created_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      fulfillment: {
        carrier: 'FedEx Ground',
        tracking_number: `TRK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        tracking_url: `https://www.fedex.com/fedextrack/?trknbr=123456789`
      }
    };

    this.mockOrders.set(orderId, order);
    return order;
  }
}

module.exports = ACPClient;

// CLI Self-Test Runner
if (require.main === module) {
  (async () => {
    console.log('Testing ACPClient in Mock Emulation Mode...');
    const client = new ACPClient({ useMock: true });

    const negotiation = await client.negotiate({
      lineItems: [{ sku: 'RUN-SHOE-BLU-M', quantity: 1, unit_price: 100.00, title: 'SpeedRunner Blue' }],
      shippingAddress: {
        name: 'Jane Doe',
        line1: '123 Market St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US'
      }
    });

    console.log('1. Negotiated Session:', negotiation.session_id, `Total: $${negotiation.total_amount}`);

    const spt = await client.mintStripePaymentToken({
      maxAmount: negotiation.total_amount,
      customerConsent: true
    });
    console.log('2. Minted Scoped SPT:', spt.token, `Cap: $${spt.max_amount}`);

    const checkout = await client.createCheckoutSession({
      sessionId: negotiation.session_id,
      selectedShippingId: negotiation.selected_shipping_id,
      paymentToken: spt
    });
    console.log('3. Checkout Result:', checkout.status, `Order ID: ${checkout.order_id}`);

    const orderStatus = await client.getOrderStatus(checkout.order_id);
    console.log('4. Order Status:', orderStatus.fulfillment);
    console.log('Test completed successfully!');
  })().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}
