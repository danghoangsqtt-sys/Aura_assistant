/**
 * OllamaService — Local LLM Integration for Aura Desktop
 * Communicates with Ollama API at localhost:11434
 * Used as a "workhorse" for heavy text processing (summarization, analysis)
 * while Gemini handles voice conversation.
 */
const http = require('http');

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:7b';
const GENERATE_TIMEOUT = 60000; // 60s
const PING_TIMEOUT = 3000;     // 3s

let ollamaHost = DEFAULT_HOST;
let isConnected = false;
let availableModels = [];

/**
 * Make an HTTP request to Ollama API
 */
function request(method, path, body = null, timeout = GENERATE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ollamaHost);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          // Ollama streaming: last line is the final response
          // For non-streaming, parse directly
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Handle streaming JSON (each line is a JSON object)
            const lines = data.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            resolve(JSON.parse(lastLine));
          } else {
            reject(new Error(`Ollama API error ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Ollama response: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Ollama request timeout after ${timeout}ms`));
    });

    req.on('error', (e) => {
      reject(new Error(`Ollama connection error: ${e.message}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Check if Ollama is running and available
 */
async function checkStatus() {
  try {
    const tagsResponse = await request('GET', '/api/tags', null, PING_TIMEOUT);
    availableModels = (tagsResponse.models || []).map(m => m.name);
    isConnected = true;
    console.log(`[Ollama] ✅ Connected. Models: [${availableModels.join(', ')}]`);
    return {
      available: true,
      models: availableModels,
      host: ollamaHost,
    };
  } catch (e) {
    isConnected = false;
    availableModels = [];
    console.log(`[Ollama] ❌ Not available: ${e.message}`);
    return {
      available: false,
      models: [],
      host: ollamaHost,
      error: e.message,
    };
  }
}

/**
 * Generate text using Ollama (non-streaming)
 * @param {string} prompt - The prompt to send
 * @param {object} options - { model, system, temperature, maxTokens }
 */
async function generate(prompt, options = {}) {
  const model = options.model || DEFAULT_MODEL;

  if (!isConnected) {
    const status = await checkStatus();
    if (!status.available) {
      return { success: false, error: 'Ollama không khả dụng. Hãy khởi động Ollama trước.' };
    }
  }

  // Check if model is available
  if (availableModels.length > 0 && !availableModels.some(m => m.startsWith(model.split(':')[0]))) {
    return {
      success: false,
      error: `Model "${model}" chưa được cài. Models có sẵn: ${availableModels.join(', ')}. Cài bằng: ollama pull ${model}`,
    };
  }

  try {
    const body = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.3,
        num_predict: options.maxTokens || 2048,
      },
    };

    if (options.system) {
      body.system = options.system;
    }

    console.log(`[Ollama] Generating with ${model}... (prompt: ${prompt.length} chars)`);
    const startTime = Date.now();

    const response = await request('POST', '/api/generate', body);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outputLen = (response.response || '').length;
    console.log(`[Ollama] Done in ${elapsed}s (output: ${outputLen} chars)`);

    return {
      success: true,
      text: response.response || '',
      model: response.model || model,
      evalDuration: response.eval_duration,
      totalDuration: response.total_duration,
    };
  } catch (e) {
    console.error(`[Ollama] Generate error:`, e.message);
    // Retry once
    try {
      console.log('[Ollama] Retrying...');
      const body = { model, prompt, stream: false };
      const response = await request('POST', '/api/generate', body);
      return { success: true, text: response.response || '', model };
    } catch (retryErr) {
      return { success: false, error: `Ollama generate failed: ${retryErr.message}` };
    }
  }
}

/**
 * Summarize a long text using local LLM
 * Optimized prompt for summarization tasks
 */
async function summarize(text, options = {}) {
  const lang = options.language || 'Vietnamese';
  const prompt = `Summarize the following document concisely in ${lang}. Focus on key points, conclusions, and action items. Keep it under 500 words.\n\n---\n${text}\n---\n\nSummary:`;

  return generate(prompt, {
    model: options.model || DEFAULT_MODEL,
    system: `You are a professional document summarizer. Always respond in ${lang}. Be concise and factual.`,
    temperature: 0.2,
    maxTokens: 1024,
  });
}

/**
 * List available models
 */
function listModels() {
  return availableModels;
}

/**
 * Set custom Ollama host
 */
function setHost(host) {
  ollamaHost = host || DEFAULT_HOST;
  isConnected = false;
  console.log(`[Ollama] Host set to: ${ollamaHost}`);
}

module.exports = {
  checkStatus,
  generate,
  summarize,
  listModels,
  setHost,
};
