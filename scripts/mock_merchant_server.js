/**
 * Mock ACP Merchant Server
 * Provides a lightweight HTTP server implementing OpenAI & Stripe Agentic Commerce Protocol endpoints.
 * Requires zero external dependencies.
 */

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 8088;
const orders = new Map();
const sessions = new Map();

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const jsonStr = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key'
  });
  res.end(jsonStr);
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parsedUrl = new URL(url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key'
    });
    return res.end();
  }

  try {
    // Health Check
    if (method === 'GET' && (pathname === '/health' || pathname === '/')) {
      return sendJson(res, 200, { status: 'healthy', service: 'ACP Mock Merchant Server', protocol_version: '1.0.0' });
    }

    // Endpoint 1: Capability & Cart Negotiation
    if (method === 'POST' && pathname === '/api/acp/negotiate') {
      const body = await parseJsonBody(req);
      const { line_items, shipping_address, promo_code } = body;

      if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
        return sendJson(res, 400, { error: 'Missing or invalid line_items' });
      }

      let subtotal = 0;
      for (const item of line_items) {
        const price = item.unit_price || 99.00;
        subtotal += price * (item.quantity || 1);
      }

      const discount = promo_code === 'SAVE10' ? subtotal * 0.1 : 0.0;
      const subtotalAfterDiscount = subtotal - discount;
      const taxRate = shipping_address?.country === 'US' ? 0.0825 : 0.15;
      const tax = Number((subtotalAfterDiscount * taxRate).toFixed(2));

      const shippingOptions = [
        { id: 'ship_standard', name: 'Standard Courier (3-5 days)', amount: 5.00, estimated_delivery: '2026-11-01' },
        { id: 'ship_express', name: 'Express Next-Day Delivery', amount: 15.00, estimated_delivery: '2026-10-26' }
      ];

      const defaultShipping = shippingOptions[0];
      const totalAmount = Number((subtotalAfterDiscount + tax + defaultShipping.amount).toFixed(2));
      const sessionId = `acp_sess_${crypto.randomBytes(6).toString('hex')}`;

      const sessionData = {
        session_id: sessionId,
        currency: 'usd',
        subtotal: Number(subtotal.toFixed(2)),
        discount_amount: Number(discount.toFixed(2)),
        tax: tax,
        shipping_options: shippingOptions,
        selected_shipping_id: defaultShipping.id,
        total_amount: totalAmount,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };

      sessions.set(sessionId, sessionData);
      return sendJson(res, 200, sessionData);
    }

    // Endpoint 2: Checkout Session (Charge Processing)
    if (method === 'POST' && pathname === '/api/acp/checkout_sessions') {
      const body = await parseJsonBody(req);
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotency_key;
      const { session_id, selected_shipping_id, payment_method } = body;

      if (!session_id || !selected_shipping_id || !payment_method?.token) {
        return sendJson(res, 400, { error: 'Invalid checkout request parameters.' });
      }

      // Check Idempotency cache
      if (idempotencyKey) {
        for (const order of orders.values()) {
          if (order.idempotency_key === idempotencyKey) {
            return sendJson(res, 200, order);
          }
        }
      }

      const session = sessions.get(session_id);
      const chargeAmount = session ? session.total_amount : (payment_method.max_amount || 115.00);

      // Validate payment token structure
      if (payment_method.max_amount && payment_method.max_amount < chargeAmount) {
        return sendJson(res, 402, {
          error: 'Payment token max_amount exceeded authoritative cart total.',
          required_amount: chargeAmount,
          token_max_amount: payment_method.max_amount
        });
      }

      const orderId = `ord_live_${crypto.randomBytes(5).toString('hex')}`;
      const orderRecord = {
        order_id: orderId,
        session_id: session_id,
        status: 'PLACED',
        total_charged: chargeAmount,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
        fulfillment: {
          carrier: 'FedEx Express',
          tracking_number: `TRK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          tracking_url: `https://track.carrier.com/tracking?id=${orderId}`
        }
      };

      orders.set(orderId, orderRecord);
      return sendJson(res, 201, orderRecord);
    }

    // Endpoint 3: Order Status Query
    if (method === 'GET' && pathname.startsWith('/api/acp/orders/')) {
      const orderId = pathname.replace('/api/acp/orders/', '');
      const order = orders.get(orderId);

      if (!order) {
        return sendJson(res, 404, { error: `Order ${orderId} not found.` });
      }

      return sendJson(res, 200, order);
    }

    // 404 Catch-All
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[ACP Mock Server] Running at http://localhost:${PORT}`);
    console.log(`- Health Check: http://localhost:${PORT}/health`);
    console.log(`- Negotiate:    POST http://localhost:${PORT}/api/acp/negotiate`);
    console.log(`- Checkout:     POST http://localhost:${PORT}/api/acp/checkout_sessions`);
  });
}

module.exports = server;
