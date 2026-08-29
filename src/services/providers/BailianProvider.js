// ============================================================
// BailianProvider — Alibaba Cloud DashScope (Bailian)
// OpenAI-compatible endpoint, model: qwen-plus
// Endpoint format: {BASE_URL}/chat/completions
// ============================================================

const TIMEOUT_MS = 60000; // 60-second timeout (US endpoint may be slower)

export class BailianProvider {
  constructor(config) {
    this.config = config;
    // BASE_URL from config (e.g., https://ws-xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1)
    this.baseUrl = config.endpoint;
    // Full endpoint for HTTP fetch: BASE_URL + /chat/completions
    this.endpoint = `${config.endpoint.replace(/\/+$/, '')}/chat/completions`;
    this.apiKey = config.apiKey || '';
    this.model = config.model;

    // Constructor-time API Key diagnostics
    const masked = this.apiKey
      ? this.apiKey.slice(0, 8) + '...' + this.apiKey.slice(-4)
      : '(EMPTY)';
    console.log('[Bailian] Provider initialized:');
    console.log('  Model   :', this.model);
    console.log('  Base URL:', this.baseUrl);
    console.log('  API Key :', masked, `(len=${this.apiKey.length})`);
    if (!this.apiKey) {
      console.warn('[Bailian] ⚠️  API KEY IS EMPTY — check EXPO_PUBLIC_BAILIAN_API_KEY in .env');
    }
  }

  async generate(prompt, params) {
    if (!this.apiKey) {
      throw new Error('Bailian API key not configured (EXPO_PUBLIC_BAILIAN_API_KEY is empty)');
    }

    console.log('[Bailian] Request details:');
    console.log('  BASE_URL:', this.baseUrl);
    console.log('  Full endpoint:', this.endpoint);
    console.log('  Model:', this.model);
    console.log('  API Key prefix:', this.apiKey.slice(0, 8) + '...', `(len=${this.apiKey.length})`);

    // Create AbortController for 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const requestBody = {
        model: this.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
<<<<<<< HEAD
        // Low temperature is critical for language compliance — high temperature (0.85+)
        // causes qwen to ignore the "output in Chinese only" instruction and mix languages.
        // Range: 0.35–0.50, with a small bump for casual tones to keep copy lively.
        temperature: 0.35 + (params.tone > 5 ? 0.15 : 0),
        max_tokens: Math.max(800, params.wordCount + 200),
        top_p: 0.85,
=======
        temperature: 0.85 + (params.tone > 5 ? 0.15 : -0.15),
        max_tokens: Math.max(800, params.wordCount + 200),
        top_p: 0.9,
>>>>>>> 12460ba241a064b8de554b017c18b5b025c65ce2
        enable_thinking: false,
      };

      console.log('[Bailian] Request body:', JSON.stringify(requestBody).slice(0, 300));

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      console.log('[Bailian] Response status:', response.status, response.statusText);
      console.log('[Bailian] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())).slice(0, 500));

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Bailian] Error response body:', errorBody);
        console.error('[Bailian] Error details:');
        console.error('  Status:', response.status);
        console.error('  Endpoint:', this.endpoint);
        console.error('  Model:', this.model);
        console.error('  Body (first 500 chars):', errorBody.slice(0, 500));

        // Provide specific error messages for common status codes
        if (response.status === 401) {
          throw new Error(`Bailian 401 Unauthorized — API Key invalid or expired. Key prefix: ${this.apiKey.slice(0, 8)}...`);
        } else if (response.status === 404) {
          throw new Error(`Bailian 404 Not Found — Check endpoint URL and model name. Endpoint: ${this.endpoint}, Model: ${this.model}`);
        } else if (response.status === 429) {
          throw new Error(`Bailian 429 Rate Limited — Too many requests. Please wait and retry.`);
        } else if (response.status === 400) {
          throw new Error(`Bailian 400 Bad Request — Invalid request body. Detail: ${errorBody.slice(0, 300)}`);
        } else if (response.status === 500 || response.status === 502 || response.status === 503) {
          throw new Error(`Bailian ${response.status} Server Error — Service temporarily unavailable.`);
        } else {
          throw new Error(`Bailian HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
        }
      }

      const json = await response.json();
      console.log('[Bailian] Response JSON (first 800 chars):', JSON.stringify(json).slice(0, 800));
      console.log('[Bailian] Usage:', JSON.stringify(json.usage || 'N/A'));

      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[Bailian] Empty content in response. Full JSON:', JSON.stringify(json).slice(0, 1000));
        throw new Error('Bailian returned empty content');
      }

      // Safety net: strip any <think>...</think> blocks that may still be
      // present even when enable_thinking is disabled (server-side fallback)
      const cleanedContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      return {
        text: cleanedContent,
        usage: json.usage || null,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`[Bailian] Request timed out after ${TIMEOUT_MS / 1000}s`);
        throw new Error(`Bailian request timed out after ${TIMEOUT_MS / 1000} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
