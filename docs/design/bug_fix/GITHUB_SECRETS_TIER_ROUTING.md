# GitHub Secrets Infrastructure for Tier-Based Routing

**Purpose**: Leverage existing GitHub Secrets to distinguish expert from standard tiers without hardcoding model names

**Date**: December 15, 2025  
**Related**: BUG_FIX_NAT_CONT_MODEL_ROUTING_ARCHITECTURE_FIX.md, IMPLEMENTATION_NAT_CONT_MODEL_ROUTING_ARCHITECTURE_FIX.md

---

## Overview

The GitHub Secrets infrastructure already provides the perfect mechanism for tier distinction:

```
GitHub Secrets (Environment-driven):
├── GEMINI_VISION_API_URL    ← Expert tier endpoint
├── GEMINI_API_URL           ← Standard tier endpoint
└── [Extensible for future providers]
```

This means:

- **No hardcoded model names** in code (already configured in secrets)
- **Services express tier, not model**: "I need expert quality"
- **Infrastructure maps tier → URL**: expert → GEMINI_VISION_API_URL
- **API endpoint automatically selects model**: URL determines which model backend handles request

---

## How It Works

### 1. Configuration (GitHub Secrets → Environment)

**GitHub Actions Sets**:

```yaml
GEMINI_VISION_API_URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-vision
GEMINI_API_URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash
```

**Runtime Access**:

```javascript
// These come from GitHub secrets → environment
const MODEL_TIERS = {
  expert: process.env.GEMINI_VISION_API_URL, // Auto-selected via URL
  standard: process.env.GEMINI_API_URL, // Auto-selected via URL
};
```

### 2. Service Expression (Semantic Intent)

**ebookService** (zero model awareness):

```javascript
// Service expresses tier, never mentions model name or API URL
const contentRequirements = {
  calls: [
    { callIndex: 0, role: "structure", tier: "expert" },
    { callIndex: 1, role: "opening", tier: "expert" },
    { callIndex: 2, role: "content", tier: "standard", count: 8 },
    { callIndex: 10, role: "closing", tier: "expert" },
  ],
};
```

### 3. Infrastructure Interpretation (genieService)

**genieService** (maps tier → URL):

```javascript
// Tier configuration from GitHub Secrets
const MODEL_TIERS = require("./config/modelTiers");

// Build routing map: tier → configured URL
const routingMap = buildRoutingMap(requirements, MODEL_TIERS);
// Result: {
//   0: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-vision",
//   1: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-vision",
//   2: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash",
//   ...
// }
```

### 4. API Execution (aiService)

**aiService** (dumb routing via URL):

```javascript
// Use the configured URL (from MODEL_TIERS)
const model =
  routingMap[callIndex] ||
  (callIndex === 0 ? MODEL_TIERS.expert : MODEL_TIERS.standard);

// Make request to configured endpoint
const resp = await callGemini({
  url: model, // The GitHub secret URL
  prompt: prompt,
  // ...
});

// Gemini backend automatically selects model based on URL:
// - VISION_API_URL → gemini-2.5-pro-vision
// - API_URL → gemini-2.5-flash
```

---

## Benefits Over Hardcoding

### ❌ Hardcoded (Anti-Pattern)

```javascript
// Bad: Model names in code, code changes required for any model switch
const model = callIndex === 0 ? "gemini-2.5-pro" : "gemini-2.5-flash";
```

### ✅ GitHub Secrets (Best Practice)

```javascript
// Good: Model selection via environment, no code changes needed
const model =
  callIndex === 0 ? process.env.EXPERT_MODEL : process.env.STANDARD_MODEL;

// Or even better: URL-based (Gemini backend decides model)
const model =
  callIndex === 0
    ? process.env.GEMINI_VISION_API_URL
    : process.env.GEMINI_API_URL;
```

---

## Extension: Supporting Multiple Providers

**Future-Proof Design**:

```javascript
// GitHub Secrets (scale this as needed)
const MODEL_TIERS = {
  // Gemini
  gemini_expert: process.env.GEMINI_VISION_API_URL,
  gemini_standard: process.env.GEMINI_API_URL,

  // Claude
  claude_expert: process.env.CLAUDE_OPUS_API_URL,
  claude_standard: process.env.CLAUDE_HAIKU_API_URL,

  // OpenAI
  gpt_expert: process.env.OPENAI_GPT4_URL,
  gpt_standard: process.env.OPENAI_GPT35_URL,
};

// Configuration
const ACTIVE_PROVIDER = process.env.AI_PROVIDER || "gemini";
const ACTIVE_TIERS = {
  expert: MODEL_TIERS[`${ACTIVE_PROVIDER}_expert`],
  standard: MODEL_TIERS[`${ACTIVE_PROVIDER}_standard`],
};

// Service: same code, different backend
// Just switch ACTIVE_PROVIDER environment variable!
```

---

## Configuration Examples

### Example 1: Development (Gemini)

```bash
GEMINI_VISION_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-vision
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash
```

### Example 2: Production (Gemini with Vision)

```bash
GEMINI_VISION_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-pro
```

### Example 3: Fallback to Claude

```bash
GEMINI_VISION_API_URL=https://api.anthropic.com/v1/messages  # Claude endpoint
GEMINI_API_URL=https://api.anthropic.com/v1/messages
# OR use AI_PROVIDER=claude and point to Claude-specific URLs
```

---

## Advantages of This Approach

| Aspect                         | Hardcoding             | GitHub Secrets                           |
| ------------------------------ | ---------------------- | ---------------------------------------- |
| **Model Names in Code**        | ❌ Yes                 | ✅ No                                    |
| **Code Changes for Switch**    | ❌ Yes                 | ✅ No (env var change)                   |
| **Security**                   | ❌ Credentials exposed | ✅ Secrets-managed                       |
| **12-Factor Compliance**       | ❌ No                  | ✅ Yes                                   |
| **Service Tier Awareness**     | ❌ Knows model name    | ✅ Only knows "expert" vs "standard"     |
| **Infrastructure Abstraction** | ❌ Leaky               | ✅ Clean                                 |
| **Future-Proof**               | ❌ No                  | ✅ Yes (add new secrets, no code change) |
| **Production Ready**           | ❌ Not for real use    | ✅ Yes                                   |

---

## Implementation Path

### Step 1: Store URLs in GitHub Secrets

```bash
# GitHub Repo → Settings → Secrets and variables → Actions
GEMINI_VISION_API_URL=https://generativelanguage.googleapis.com/...
GEMINI_API_URL=https://generativelanguage.googleapis.com/...
```

### Step 2: Access in Code

```javascript
const MODEL_TIERS = {
  expert: process.env.GEMINI_VISION_API_URL,
  standard: process.env.GEMINI_API_URL,
};
```

### Step 3: Route by Tier

```javascript
// genieService
const routingMap = buildRoutingMap(requirements, MODEL_TIERS);

// aiService
const modelUrl =
  routingMap[callIndex] ||
  (callIndex === 0 ? MODEL_TIERS.expert : MODEL_TIERS.standard);
```

### Step 4: Switch Models (No Code Change!)

```bash
# Just update secrets:
GEMINI_VISION_API_URL=https://api.anthropic.com/v1/...  # Switch to Claude
# Restart app, done!
```

---

## Key Principle

**Services express semantic intent (tier), infrastructure executes (URL mapping)**

```
ebookService:
  "I need expert quality for opening chapter"

genieService (orchestrator):
  tier: "expert" → MODEL_TIERS.expert → GEMINI_VISION_API_URL

geminiClient:
  POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-vision
  (backend automatically selects model based on URL)
```

---

## Conclusion

GitHub Secrets infrastructure is **already designed for exactly this use case**:

- ✅ Environment-driven configuration
- ✅ No hardcoding required
- ✅ Secure credential management
- ✅ Easy to switch providers/models
- ✅ Production-ready
- ✅ Supports tier abstraction perfectly

**Use it!**
