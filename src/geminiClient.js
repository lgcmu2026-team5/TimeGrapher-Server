export class GeminiConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

export class GeminiUpstreamError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'GeminiUpstreamError';
    this.statusCode = statusCode;
  }
}

export function createGeminiClient(config, fetchImpl = globalThis.fetch) {
  return {
    async explain({ systemPrompt, userContent }) {
      if (!config.geminiApiKey) {
        throw new GeminiConfigError('Gemini API key is not configured.');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);

      try {
        const response = await fetchImpl(config.geminiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.geminiApiKey
          },
          body: JSON.stringify({
            model: config.geminiModel,
            system_instruction: systemPrompt,
            input: userContent,
            store: false,
            generation_config: {
              temperature: 0.2,
              max_output_tokens: config.maxOutputTokens
            }
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new GeminiUpstreamError('Gemini upstream request failed.', response.status);
        }

        const data = await response.json();
        const explanation = extractText(data);
        if (!explanation) {
          throw new GeminiUpstreamError('Gemini response did not contain usable text.');
        }

        return {
          explanation,
          model: typeof data.model === 'string' && data.model ? data.model : config.geminiModel
        };
      } catch (error) {
        if (error instanceof GeminiConfigError || error instanceof GeminiUpstreamError) {
          throw error;
        }

        throw new GeminiUpstreamError('Gemini upstream request failed.');
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function extractText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.steps)) {
    const text = data.steps
      .filter((step) => step?.type === 'model_output' || step?.modelOutput)
      .flatMap((step) => step.content || step.modelOutput?.content || [])
      .map((content) => {
        if (typeof content?.text === 'string') {
          return content.text;
        }
        if (typeof content?.text?.text === 'string') {
          return content.text.text;
        }
        return '';
      })
      .join('')
      .trim();

    if (text) {
      return text;
    }
  }

  const candidateParts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(candidateParts)) {
    const text = candidateParts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (text) {
      return text;
    }
  }

  return '';
}
