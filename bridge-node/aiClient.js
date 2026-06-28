/**
 * AI Client — 统一的 AI Provider 调用封装
 * 从 slice_agent.js 提取，消除 testAiConnection/optimizeGcode/printQAStream 三函数的重复代码
 */

const fetch = require("node-fetch");

// ─── AI Provider 配置 ───

const AI_PROVIDERS = {
  local: {
    name: "本地模型 (LM Studio)",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "google/gemma-4-e2b",
    availableModels: ["google/gemma-4-e2b", "qwen/qwen3.6-35b-a3b"],
    isLocal: true,
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  zhipu: {
    name: "智谱AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    availableModels: ["glm-4-flash", "glm-4-plus", "glm-4"],
  },
  kimi: {
    name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    availableModels: ["moonshot-v1-8k", "moonshot-v1-32k"],
  },
  sensenova: {
    name: "SenseNova",
    baseUrl: "https://token.sensenova.cn/v1",
    defaultModel: "sensenova-6.7-flash-lite",
    availableModels: ["sensenova-6.7-flash-lite", "deepseek-v4-flash"],
  },
  custom: {
    name: "自定义接口",
    baseUrl: "http://localhost:8080/v1",
    defaultModel: "",
    availableModels: [],
    isCustom: true,
  },
};

/** 统一错误消息抽取 — 处理 node-fetch 的 cause 链 */
function extractErrorMessage(e) {
  return e.message
    || (e.cause && (e.cause.message || e.cause.code || String(e.cause)))
    || String(e);
}

/** AI Client — 封装 provider 解析、凭证校验、headers 构造、chat/models 请求 */
class AiClient {
  constructor(aiConfig) {
    this.provider = AI_PROVIDERS[aiConfig.provider];
    if (!this.provider) throw new Error(`Unknown AI provider: ${aiConfig.provider}`);
    this.model = aiConfig.model || this.provider.defaultModel;
    this.apiKey = aiConfig.apiKey || (this.provider.isLocal ? "no-key" : "");
    if (!this.apiKey && !this.provider.isLocal) {
      throw new Error(`API key not configured for ${this.provider.name}`);
    }
    this.baseUrl = aiConfig.customBaseUrl || this.provider.baseUrl;
    this.aiConfig = aiConfig; // 保留引用，供 listModels 回写 model
  }

  /** 构造请求 headers */
  _headers(withContentType = false) {
    const h = withContentType ? { "Content-Type": "application/json" } : {};
    if (this.apiKey && this.apiKey !== "no-key") {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  /** GET /models — 自动发现可用模型列表，保留 testAiConnection 的副作用 */
  async listModels() {
    const url = `${this.baseUrl}/models`;
    const resp = await fetch(url, { headers: this._headers(false) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const discoveredModels = (data.data || [])
      .map((m) => m.id)
      .filter((id) => !id.includes("embed"));

    if (discoveredModels.length > 0) {
      this.provider.availableModels = discoveredModels;
      if (!discoveredModels.includes(this.provider.defaultModel)) {
        this.provider.defaultModel = discoveredModels[0];
      }
      // 如果当前配置的模型不在可用列表中，自动切换到第一个可用模型
      if (this.aiConfig.model && !discoveredModels.includes(this.aiConfig.model)) {
        this.aiConfig.model = discoveredModels[0];
      }
    }

    return {
      models: discoveredModels,
      defaultModel: this.provider.defaultModel,
      currentModel: this.aiConfig.model || this.provider.defaultModel,
    };
  }

  /**
   * POST /chat/completions — 一次性或流式请求
   * 返回原始 fetch Response，调用方自行 .json() 或 .body.getReader()
   */
  async chat({ systemPrompt, userPrompt, temperature = 0.2, maxTokens = 3000, stream = false }) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    };
    if (stream) body.stream = true;

    const resp = await fetch(url, {
      method: "POST",
      headers: this._headers(true),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`AI API error: ${resp.status} ${errText.slice(0, 200)}`);
    }

    return resp;
  }

  /** 从 AI 返回内容中解析 JSON（剥离 ```json 围栏） */
  static parseJsonContent(aiContent) {
    let jsonStr = aiContent;
    const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    return JSON.parse(jsonStr.trim());
  }
}

module.exports = { AiClient, AI_PROVIDERS, extractErrorMessage };
