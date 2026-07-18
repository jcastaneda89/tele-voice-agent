import OpenAI from 'openai';

let openai: OpenAI | undefined;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export type AgentResult =
  | { action: 'call'; phoneNumber: string; reason: string }
  | { action: 'reply'; message: string };


export type VoiceTurn = {
  role: 'user' | 'assistant';
  content: string;
};
const SYSTEM_PROMPT = `Eres un asistente que prepara llamadas telefónicas solicitadas por Telegram.
Responde SIEMPRE usando exactamente una herramienta.
Usa initiate_call solo cuando el usuario solicita una llamada y proporciona un teléfono.
Normaliza el teléfono a E.164. Si no incluye código de país, asume Perú (+51).
El motivo debe ser una frase breve en español. Si faltan datos o no se solicita una llamada, usa reply y explica qué falta.`;

/** Extracts a call request through GPT-5.6 function calling. */
export async function processMessage(text: string): Promise<AgentResult> {
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'initiate_call',
          description: 'Extract a phone number and a reason to start an outbound voice call.',
          parameters: {
            type: 'object', additionalProperties: false,
            properties: {
              phoneNumber: { type: 'string', description: 'E.164 number, e.g. +51979300062.' },
              reason: { type: 'string', description: 'Short Spanish call purpose.' },
            },
            required: ['phoneNumber', 'reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reply', description: 'Reply when a call cannot or should not be initiated.',
          parameters: {
            type: 'object', additionalProperties: false,
            properties: { message: { type: 'string' } }, required: ['message'],
          },
        },
      },
    ],
    tool_choice: 'required',
  });

  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') throw new Error('GPT did not return a tool call.');

  let args: unknown;
  try { args = JSON.parse(toolCall.function.arguments); }
  catch { throw new Error('GPT returned invalid tool arguments.'); }

  if (toolCall.function.name === 'initiate_call' && isCallArgs(args)) {
    return { action: 'call', phoneNumber: args.phoneNumber, reason: args.reason };
  }
  if (toolCall.function.name === 'reply' && isReplyArgs(args)) return { action: 'reply', message: args.message };
  throw new Error('GPT returned an unsupported tool payload.');
}

function isCallArgs(value: unknown): value is { phoneNumber: string; reason: string } {
  return typeof value === 'object' && value !== null &&
    typeof (value as Record<string, unknown>).phoneNumber === 'string' &&
    typeof (value as Record<string, unknown>).reason === 'string';
}
function isReplyArgs(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).message === 'string';
}

export async function getAgentResponse(
  context: string,
  speechInput: string,
  history: VoiceTurn[] = [],
): Promise<{ text: string; hangUp: boolean }> {
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `Eres Sofia, asistente comercial de Dopa (dopa.solutions).

DOPA: ERP Agentico con trabajadores de IA autonomos 24/7. Atiende WhatsApp/IG/voz, gestiona inventario, factura electronica (SUNAT/SAT/DIAN), publica contenido, y concilia bancos via Plaid (13,000+ bancos). Planes: Starter gratis, Pro $997 USD unico, Dopa 360 enterprise. Web: dopa.solutions.

CONTEXTO: ${context}

Responde en espanol neutro LATAM, maximo 2-3 oraciones. Si el cliente pregunta sobre Dopa, usa la info de arriba. Ofrece demo en dopa.solutions si hay interes. Anade [HANGUP] solo al despedirte. NO uses [HANGUP] si el cliente sigue interesado.` },
      ...history.slice(-12),
      { role: 'user', content: speechInput },
    ],
  });
  const raw = response.choices[0]?.message.content ?? 'Gracias por tu tiempo. Hasta luego.';
  return { text: raw.replace('[HANGUP]', '').trim(), hangUp: raw.includes('[HANGUP]') };
}