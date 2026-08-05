// ============================================================
// ClaudeProvider — Anthropic Claude
// Uses Anthropic Messages API (different format from OpenAI)
// model: claude-sonnet-4-20250514
// Includes AbortController timeout (30s default)
// ============================================================

const DEFAULT_TIMEOUT_MS = 30000;

export class ClaudeProvider {
  constructor(config) {
    this.config = config;
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async generate(prompt, params) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const timeoutMs = this.config.timeout || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error('[ClaudeProvider] Request timed out after', timeoutMs, 'ms');
    }, timeoutMs);

    console.log('[ClaudeProvider] Request:', this.endpoint, 'model:', this.model, 'timeout:', timeoutMs + 'ms');

    try {
      // Anthropic Messages API format
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: Math.max(500, params.wordCount + 100),
          system: prompt.system,
          messages: [
            { role: 'user', content: prompt.user },
          ],
          temperature: 0.85 + (params.tone > 5 ? 0.15 : -0.15),
          top_p: 0.9,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[ClaudeProvider] Response status:', response.status);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[ClaudeProvider] Error body:', errorBody.slice(0, 300));
        throw new Error(`Claude HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const json = await response.json();
      console.log('[ClaudeProvider] Response OK');

      // Claude returns content as array of blocks
      const content = json.content?.[0]?.text;

      if (!content) {
        throw new Error('Claude returned empty content');
      }

      return {
        text: content,
        usage: json.usage || null,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Claude request timed out after ${timeoutMs}ms`);
      }

      console.error('[ClaudeProvider] Request failed:', error.message);
      throw error;
    }
  }
}
