<div align="center">
  <img src="https://img.shields.io/badge/Agent_Skills-100%25_Compatible-blue?style=for-the-badge&logo=openai" />
  <img src="https://img.shields.io/badge/OpenClaw-Supported-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/MCP-Compatible-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Stripe-Integrated-purple?style=for-the-badge&logo=stripe" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</div>

# Agentic Commerce Protocol (ACP) Integration

Welcome to the **Agentic Commerce Protocol (ACP)** skill module for the **GenPark/OpenClaw** ecosystem! 🚀

This skill integrates the open standard co-developed by **OpenAI** and **Stripe**, enabling AI agents to autonomously handle full post-discovery transactional commerce flows. It provides capability negotiation, cart matching, Stripe Payment Token (SPT) delegation, and fulfillment/webhook tracking.

---

## 📁 Repository Structure

```
.
├── SKILL.md                          # Full agent skill specification and prompt directives
├── README.md                         # Documentation & quickstart guide
├── scripts/
│   ├── acp_client.js                 # Complete Node.js ACP client & delegation engine
│   ├── acp_mcp_tool.js               # Model Context Protocol (MCP) schemas & execution wrappers
│   ├── mock_merchant_server.js       # Standalone test server for local ACP API emulation
│   └── test_acp_flow.js              # End-to-end integration test runner
└── references/
    ├── acp_spec.json                 # JSON Schema validation definitions
    └── acp_architecture.md           # In-depth security & state machine documentation
```

---

## ⚡ Quickstart & Testing

All scripts are written in native modern Node.js and require **zero external npm dependencies**.

### 1. Run the End-to-End Test Suite
Tests negotiation, scoped token delegation, order checkout, and idempotency protection against an active HTTP test server:
```bash
node scripts/test_acp_flow.js
```

### 2. Run the MCP Tool Dispatcher
Tests the Model Context Protocol tools exposed to LLM agents:
```bash
node scripts/acp_mcp_tool.js
```

### 3. Start the Mock Merchant Server
```bash
node scripts/mock_merchant_server.js
# Server running at http://localhost:8088
```

---

## 🤖 MCP (Model Context Protocol) Integration

To equip your AI agent (Anthropic Claude, OpenClaw, Antigravity, Cursor) with ACP tools, add the following to your MCP configuration:

```json
{
  "mcpServers": {
    "agentic-commerce": {
      "command": "node",
      "args": ["path/to/scripts/acp_mcp_tool.js"],
      "env": {
        "ACP_MERCHANT_BASE_URL": "http://localhost:8088",
        "STRIPE_MERCHANT_ID": "acct_acp_demo"
      }
    }
  }
}
```

### Available MCP Tools

| Tool Name | Purpose |
| :--- | :--- |
| `acp_negotiate_cart` | Resolves cart subtotal, shipping choices, and dynamic sales taxes with merchant |
| `acp_mint_payment_token` | Mints a scoped single-use Stripe Payment Token (SPT) with customer consent |
| `acp_create_checkout_session` | Submits payment token and locks order creation |
| `acp_track_order` | Queries live fulfillment, tracking numbers, and delivery status |

---

## 🛠️ Programmatic Usage

```javascript
const ACPClient = require('./scripts/acp_client');

const client = new ACPClient({
  baseUrl: 'https://api.merchant.com', // Omit or set useMock: true for offline mode
  merchantId: 'acct_merchant_123'
});

async function buyProduct() {
  // 1. Negotiate checkout session
  const session = await client.negotiate({
    lineItems: [{ sku: 'PRO-RUNNER-9', quantity: 1, unit_price: 120.00 }],
    shippingAddress: { line1: '123 Market St', city: 'San Francisco', state: 'CA', postal_code: '94105', country: 'US' }
  });

  // 2. Mint single-use scoped payment token (SPT)
  const token = await client.mintStripePaymentToken({
    maxAmount: session.total_amount,
    customerConsent: true
  });

  // 3. Finalize order
  const order = await client.createCheckoutSession({
    sessionId: session.session_id,
    selectedShippingId: session.selected_shipping_id,
    paymentToken: token
  });

  console.log(`Order placed: ${order.order_id}, Tracking: ${order.fulfillment.tracking_number}`);
}
```

---

## 🔑 Core Features

- **Authoritative Negotiation**: Coordinates dynamic taxes, shipping rates, and stock availability directly from merchant APIs.
- **Stripe Payment Token (SPT) Delegation**: Eliminates credential exposure by scoping charges to specific merchants, amounts, and expiration times.
- **Idempotency Protection**: Safe network retries using client-generated idempotency keys.
- **Fulfillment Tracking**: Real-time order queries and carrier tracking updates.

---

## 📜 References & Specifications

- [Architecture & Security Overview](references/acp_architecture.md)
- [ACP JSON Schema Specification](references/acp_spec.json)
- [Official Agentic Commerce Protocol Standard](https://agenticcommerce.dev)

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
