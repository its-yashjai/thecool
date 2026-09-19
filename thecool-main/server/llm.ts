/**
 * Optional LLM layer (any OpenAI-compatible API: Groq, OpenAI, ...).
 *
 * Design rules:
 *  - The LLM only PHRASES answers to open questions, grounded in the documents Moss retrieved
 *    plus the live cluster numbers. It never triggers actions: commands like "start simulation" or
 *    "emergency cooling" are handled by deterministic rules.
 *  - Any failure or timeout falls back to the rule-based answer, so the demo never stalls.
 *
 * Env:
 *   LLM_API_KEY   (or OPENAI_API_KEY)
 *   LLM_BASE_URL  e.g. https://api.groq.com/openai/v1   (omit for OpenAI itself)
 *   LLM_MODEL     e.g. openai/gpt-oss-120b on Groq       (required unless using api.openai.com)
 *   LLM_TIMEOUT_MS  default 6000
 */
import OpenAI from 'openai';
import type { MossSearchResponse } from './moss.js';

export interface LlmStatus {
  configured: boolean;
  model?: string;
  host?: string;
  reason?: string;
}

interface LlmConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
}

let cached: { cfg: LlmConfig | null; status: LlmStatus; client: OpenAI | null } | null = null;

function load() {
  if (cached) return cached;
  const apiKey = (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const baseURL = (process.env.LLM_BASE_URL || '').trim() || undefined;
  const modelEnv = (process.env.LLM_MODEL || process.env.OPENAI_MODEL || '').trim();
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 6000;

  if (!apiKey) {
    cached = { cfg: null, client: null, status: { configured: false, reason: 'LLM_API_KEY not set (rule-based answers only).' } };
    return cached;
  }

  let host: string | undefined;
  try {
    host = baseURL ? new URL(baseURL).hostname : 'api.openai.com';
  } catch {
    cached = { cfg: null, client: null, status: { configured: false, reason: `LLM_BASE_URL is not a valid URL: ${baseURL}` } };
    return cached;
  }

  const model = modelEnv || (host === 'api.openai.com' ? 'gpt-4o-mini' : '');
  if (!model) {
    cached = {
      cfg: null,
      client: null,
      status: { configured: false, host, reason: `LLM_MODEL must be set when using ${host} (e.g. openai/gpt-oss-120b on Groq).` },
    };
    return cached;
  }

  const cfg: LlmConfig = { apiKey, baseURL, model, timeoutMs };
  cached = { cfg, client: new OpenAI({ apiKey, baseURL, maxRetries: 0 }), status: { configured: true, model, host } };
  return cached;
}

export function llmStatus(): LlmStatus {
  return load().status;
}

function clean(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LiveState {
  junctionC?: number;
  fanPct?: number;
  powerW?: number;
  forecastWorstC?: number;
  running?: boolean;
  aiReqs?: number;
}

function buildSystemPrompt(state: LiveState, moss: MossSearchResponse): string {
  const docs = moss.results
    .slice(0, 3)
    .map((r, i) => {
      const d = r.document;
      return `[${i + 1}] (${d.id}) ${d.title}. ${d.summary} ${d.content.slice(0, 420)}${d.actionableProtocol ? ' Action: ' + d.actionableProtocol : ''}`;
    })
    .join('\n');

  const f = (n: number | undefined, unit: string) => (typeof n === 'number' ? `${n.toFixed(1)}${unit}` : 'unknown');

  return `You are NeuralFlow, a voice co-pilot for a GPU cluster thermal-management demo. You are speaking out loud to an operator.

LIVE CLUSTER STATE (from the simulator):
junction ${f(state.junctionC, ' C')}, fan ${f(state.fanPct, '%')}, power ${f(state.powerW, ' W')}, 60-second forecast worst case ${f(state.forecastWorstC, ' C')}, simulation ${state.running ? 'running' : 'paused'}.

REFERENCE DOCUMENTS RETRIEVED BY MOSS:
${docs || '(nothing relevant was retrieved)'}

RULES:
- Answer in at most 40 words, plain spoken English, no lists, no markdown.
- Use ONLY the documents and live state above. If they do not cover the question, say you do not have that in the knowledge base and suggest a related command.
- Never invent numbers. Quote temperatures and fan speeds only from the live state.
- When you use a document, name its runbook or reference id naturally, for example "per RB-01".
- You cannot perform actions in this reply. If the operator asks you to do something, tell them the exact command to say, such as "start simulation" or "pre-ramp fans".`;
}

function buildAgentPrompt(transcript: string, moss: MossSearchResponse | null): string {
  if (!moss || moss.results.length === 0) {
    return `You are a helpful general-purpose AI assistant. Answer the user's question clearly, accurately and helpfully in plain English.`;
  }
  const docs = moss.results
    .slice(0, 3)
    .map((r, i) => {
      const d = r.document;
      return `[${i + 1}] (${d.id}) ${d.title}. ${d.summary} ${d.content.slice(0, 480)}${d.actionableProtocol ? ' Action: ' + d.actionableProtocol : ''}`;
    })
    .join('\n');
  return `You are a helpful general-purpose AI assistant. Answer the user's question clearly and accurately.

If the question is about NeuralFlow, datacenter, GPU hardware, runbooks, or thermal management, use the following retrieved context if relevant. If the context is not relevant, answer from your own general knowledge. Do not force the context if it doesn't match.

RETRIEVED CONTEXT (from Moss knowledge base):
${docs}

Answer helpfully and concisely.`;
}

export async function askAgent(
  transcript: string,
  moss: MossSearchResponse | null
): Promise<{ text: string; ms: number; model: string }> {
  const { cfg, client } = load();
  if (!cfg || !client) throw new Error('LLM not configured');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const t0 = performance.now();
  try {
    const res = await client.chat.completions.create(
      {
        model: cfg.model,
        messages: [
          { role: 'system', content: buildAgentPrompt(transcript, moss) },
          { role: 'user', content: transcript },
        ],
        temperature: 0.3,
        max_tokens: 800,
      },
      { signal: ctrl.signal }
    );
    const text = clean(res.choices[0]?.message?.content ?? '');
    if (!text) throw new Error('LLM returned an empty answer');
    return { text, ms: Math.round((performance.now() - t0) * 10) / 10, model: cfg.model };
  } finally {
    clearTimeout(timer);
  }
}

/** Returns a spoken answer and its latency, or throws (caller falls back to rules). */
export async function askLlm(
  transcript: string,
  state: LiveState,
  moss: MossSearchResponse
): Promise<{ text: string; ms: number; model: string }> {
  const { cfg, client } = load();
  if (!cfg || !client) throw new Error('LLM not configured');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const t0 = performance.now();
  try {
    const res = await client.chat.completions.create(
      {
        model: cfg.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(state, moss) },
          { role: 'user', content: transcript },
        ],
        temperature: 0.2,
        // Reasoning models count thinking tokens against this limit, so leave headroom.
        max_tokens: 600,
      },
      { signal: ctrl.signal }
    );
    const text = clean(res.choices[0]?.message?.content ?? '');
    if (!text) throw new Error('LLM returned an empty answer');
    const words = text.split(' ');
    const spoken = words.length > 60 ? words.slice(0, 60).join(' ') + '.' : text;
    return { text: spoken, ms: Math.round((performance.now() - t0) * 10) / 10, model: cfg.model };
  } finally {
    clearTimeout(timer);
  }
}
