// ============================================================
// DeepSeekProvider — DeepSeek Chat
// OpenAI-compatible endpoint, model: deepseek-chat
// Includes AbortController timeout (30s default)
// ============================================================

const DEFAULT_TIMEOUT_MS = 30000;

export class DeepSeekProvider {
  constructor(config) {
    this.config = config;
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async generate(prompt, params) {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    const timeoutMs = this.config.timeout || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error('[DeepSeekProvider] Request timed out after', timeoutMs, 'ms');
    }, timeoutMs);

    console.log('[DeepSeekProvider] Request:', this.endpoint, 'model:', this.model, 'timeout:', timeoutMs + 'ms');

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: 0.85 + (params.tone > 5 ? 0.15 : -0.15),
          max_tokens: Math.max(500, params.wordCount + 100),
          top_p: 0.9,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[DeepSeekProvider] Response status:', response.status);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[DeepSeekProvider] Error body:', errorBody.slice(0, 300));
        throw new Error(`DeepSeek HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const json = await response.json();
      console.log('[DeepSeekProvider] Response OK');

      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('DeepSeek returned empty content');
      }

      return {
        text: content,
        usage: json.usage || null,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`DeepSeek request timed out after ${timeoutMs}ms`);
      }

      console.error('[DeepSeekProvider] Request failed:', error.message);
      throw error;
    }
  }
}
