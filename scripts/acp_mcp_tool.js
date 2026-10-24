/**
 * Agentic Commerce Protocol (ACP) MCP Tools Spec
 * Outlines Model Context Protocol (MCP) schemas and execution wrappers
 * to let GenPark/OpenClaw AI Agents programmatically execute agentic commerce checkouts.
 */

const ACPClient = require('./acp_client');

// Initialize ACP Client with environment settings or mock fallback
const baseUrl = process.env.ACP_MERCHANT_BASE_URL || null;
const merchantId = process.env.STRIPE_MERCHANT_ID || 'acct_acp_demo';
const client = new ACPClient({ baseUrl, merchantId, useMock: !baseUrl });

/**
 * List of available commerce negotiation and payment tools exposed via MCP.
 */
const tools = [
  {
    name: 'acp_negotiate_cart',
    description: 'Negotiate real-time inventory, sales tax, discounts, and available shipping tiers with an ACP-compliant merchant.',
    inputSchema: {
      type: 'object',
      properties: {
        cartId: { type: 'string', description: 'Optional unique shopping cart identifier' },
        lineItems: {
          type: 'array',
          description: 'List of items to purchase with SKUs and quantities',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string', description: 'Product stock keeping unit' },
              quantity: { type: 'integer', minimum: 1, description: 'Number of units' },
              unit_price: { type: 'number', description: 'Estimated unit price in currency units' },
              title: { type: 'string', description: 'Product title' }
            },
            required: ['sku', 'quantity']
          }
        },
        shippingAddress: {
          type: 'object',
          description: 'Destination shipping address for calculating tax and shipping rates',
          properties: {
            name: { type: 'string' },
            line1: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postal_code: { type: 'string' },
            country: { type: 'string', description: '2-letter ISO country code (e.g. US)' }
          },
          required: ['postal_code', 'country']
        },
        promoCode: { type: 'string', description: 'Optional promotional coupon code' }
      },
      required: ['lineItems', 'shippingAddress']
    }
  },
  {
    name: 'acp_mint_payment_token',
    description: 'Mint a scoped single-use Stripe Payment Token (SPT) bound to the target merchant and exact price ceiling.',
    inputSchema: {
      type: 'object',
      properties: {
        maxAmount: { type: 'number', minimum: 0.01, description: 'Maximum authorized charge limit' },
        currency: { type: 'string', default: 'usd', description: 'Currency ISO code' },
        merchantId: { type: 'string', description: 'Target merchant Stripe Account ID' },
        customerConsent: { type: 'boolean', description: 'Explicit buyer confirmation (must be true)' }
      },
      required: ['maxAmount', 'customerConsent']
    }
  },
  {
    name: 'acp_create_checkout_session',
    description: 'Finalize the programmatic checkout by presenting the scoped payment token to the merchant.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Authoritative session ID obtained from acp_negotiate_cart' },
        selectedShippingId: { type: 'string', description: 'Chosen shipping tier ID (e.g., ship_standard, ship_express)' },
        paymentToken: {
          type: 'object',
          description: 'Scoped Stripe Payment Token object',
          properties: {
            type: { type: 'string', enum: ['stripe_payment_token'] },
            token: { type: 'string' },
            max_amount: { type: 'number' },
            currency: { type: 'string' }
          },
          required: ['type', 'token']
        },
        idempotencyKey: { type: 'string', description: 'Optional idempotency key to prevent double charge' }
      },
      required: ['sessionId', 'selectedShippingId', 'paymentToken']
    }
  },
  {
    name: 'acp_track_order',
    description: 'Retrieve real-time fulfillment status, carrier details, and tracking numbers for an ACP order.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Unique order identifier returned by checkout' }
      },
      required: ['orderId']
    }
  }
];

/**
 * Tool dispatcher function for agent runtimes.
 * @param {string} name
 * @param {Object} args
 * @returns {Promise<Object>}
 */
async function callTool(name, args) {
  switch (name) {
    case 'acp_negotiate_cart':
      return await client.negotiate({
        cartId: args.cartId,
        lineItems: args.lineItems,
        shippingAddress: args.shippingAddress,
        promoCode: args.promoCode
      });

    case 'acp_mint_payment_token':
      return await client.mintStripePaymentToken({
        maxAmount: args.maxAmount,
        currency: args.currency || 'usd',
        merchantId: args.merchantId,
        customerConsent: args.customerConsent
      });

    case 'acp_create_checkout_session':
      return await client.createCheckoutSession({
        sessionId: args.sessionId,
        selectedShippingId: args.selectedShippingId,
        paymentToken: args.paymentToken,
        idempotencyKey: args.idempotencyKey
      });

    case 'acp_track_order':
      return await client.getOrderStatus(args.orderId);

    default:
      throw new Error(`Unknown ACP tool: ${name}`);
  }
}

module.exports = {
  tools,
  callTool,
  client
};

// Interactive CLI test if executed directly
if (require.main === module) {
  (async () => {
    console.log('Testing ACP MCP Tool Dispatcher...');
    console.log(`Available Tools: ${tools.map(t => t.name).join(', ')}\n`);

    const cartResult = await callTool('acp_negotiate_cart', {
      lineItems: [{ sku: 'HEADPHONES-ANC-BLK', quantity: 1, unit_price: 199.00 }],
      shippingAddress: { line1: '456 Tech Blvd', city: 'Seattle', state: 'WA', postal_code: '98101', country: 'US' },
      promoCode: 'SAVE10'
    });
    console.log('Negotiate Result:', JSON.stringify(cartResult, null, 2));

    const tokenResult = await callTool('acp_mint_payment_token', {
      maxAmount: cartResult.total_amount,
      customerConsent: true
    });
    console.log('\nMint Payment Token Result:', JSON.stringify(tokenResult, null, 2));

    const orderResult = await callTool('acp_create_checkout_session', {
      sessionId: cartResult.session_id,
      selectedShippingId: cartResult.selected_shipping_id,
      paymentToken: tokenResult
    });
    console.log('\nCheckout Session Result:', JSON.stringify(orderResult, null, 2));

    const trackResult = await callTool('acp_track_order', {
      orderId: orderResult.order_id
    });
    console.log('\nTrack Order Result:', JSON.stringify(trackResult, null, 2));
  })().catch(err => {
    console.error('MCP Tool Execution Failed:', err);
    process.exit(1);
  });
}
