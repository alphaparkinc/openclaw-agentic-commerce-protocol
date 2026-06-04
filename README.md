<div align="center">
  <img src="https://img.shields.io/badge/Agent_Skills-100%25_Compatible-blue?style=for-the-badge&logo=openai" />
  <img src="https://img.shields.io/badge/OpenClaw-Supported-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Stripe-Integrated-purple?style=for-the-badge&logo=stripe" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</div>

# Agentic Commerce Protocol (ACP) Integration

Welcome to the **Agentic Commerce Protocol (ACP)** skill module for the **GenPark/OpenClaw** ecosystem! 🚀

This skill integrates the open standard co-developed by **OpenAI** and **Stripe**, enabling AI agents to autonomously handle full post-discovery transactional commerce flows. It supports capability negotiation, cart matching, Stripe Payment Token (SPT) delegation, and fulfillment/webhook tracking.

---

## 🛠️ Installation & Usage

Clone this repository directly into your agent framework's `skills/` directory:

```bash
cd your-agent-workspace/skills
git clone https://github.com/alphaparkinc/openclaw-agentic-commerce-protocol.git
```

For GenPark multi-agent setup, declare the skill import in your agent declaration configuration file:

```json
{
  "skills": [
    "openclaw-agentic-commerce-protocol"
  ]
}
```

---

## 🔑 Core Features

- **Cart & Price Negotiation**: Programmatically coordinates taxes, shipping fees, and inventory verification directly between the agent and ACP-compliant merchant servers.
- **Secure Payments (SPT)**: Generates and handles Stripe Payment Tokens (SPTs), authorizing specific transactions without exposing billing details.
- **Asynchronous Fulfillment**: Listens to fulfillment states (`PLACED`, `SHIPPED`, `DELIVERED`) to converse with customers regarding tracking.

---

## 📜 Specifications & Standards

This skill conforms strictly to the version 1.0 specifications of the Agentic Commerce Protocol.

For more details, see the official specification at [agenticcommerce.dev](https://agenticcommerce.dev).

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
