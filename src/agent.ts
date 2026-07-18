import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

interface AgentResult {
  action: 'call' | 'reply';
  phoneNumber?: string;
  reason?: string;
  message?: string;
}

const SYSTEM_PROMPT = `Eres un asistente virtual que ayuda a iniciar llamadas telefónicas con IA.
Tu única función es extraer números de teléfono y motivos de llamada de los mensajes del usuario.

REGLAS:
1. Si el mensaje contiene un numero de telefono y un motivo, usa la funcion initiate_call.
2. El numero debe estar en formato E.164 (con codigo de pais, ej: +51979300062).
3. Si el numero no tiene codigo de pais, asume Peru (+51).
4. Si el usuario solo saluda o pregunta algo sin dar un numero, usa la funcion reply con un mensaje amable.
5. El motivo (reason) debe ser una frase corta en espanol que describa el proposito de la llamada.`;

/**
 * Processes a user message with GPT-5.6 to determine if a call should be made.
 * Uses tool calling (function calling) for structured extraction.
 */
export async function processMessage(text: string): Promise<AgentResult> {
  console.log('[AGENT] Processing:', text);

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o', // GPT-5.6 when available; gpt-4o as fallback
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'initiate_call',
          description: 'Inicia una llamada telefónica con IA al número especificado',
          parameters: {
            type: 'object',
            properties: {
              phoneNumber: {
                type: 'string',
                description: 'Número de teléfono en formato E.164 (ej: +51979300062)',
              },
              reason: {
                type: 'string',
                description: 'Motivo de la llamada en español',
              },
            },
            required: ['phoneNumber', 'reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reply',
          description: 'Responde al usuario sin iniciar una llamada',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Mensaje de respuesta en español',
              },
            },
            required: ['message'],
          },
        },
      },
    ],
    tool_choice: 'auto',
    temperature: 0.1,
  });

  const message = response.choices[0]?.message;

  if (message?.tool_calls?.length) {
    const toolCall = message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    if (toolCall.function.name === 'initiate_call') {
      return {
        action: 'call',
        phoneNumber: args.phoneNumber,
        reason: args.reason,
      };
    }
    if (toolCall.function.name === 'reply') {
      return { action: 'reply', message: args.message };
    }
  }

  // Fallback: try parsing the content as JSON (handles markdown code fences)
  let content = message?.content || '';
  // Strip markdown code fences if present
  content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.action === 'call' && parsed.phoneNumber) {
        return parsed;
      }
      if (parsed.action === 'reply') {
        return parsed;
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  return { action: 'reply', message: content || 'No entendí. Intenta de nuevo con un número de teléfono.' };
}

/**
 * Conversational agent for voice calls.
 * Receives the call context (prompt) and what the caller just said (speechInput),
 * returns the AI agent's spoken response and whether to hang up.
 *
 * Built with Codex + GPT-5.6 — the agent maintains conversational context
 * through the system prompt and decides when the conversation is complete.
 */
export async function getAgentResponse(
  context: string,
  speechInput: string
): Promise<{ text: string; hangUp: boolean }> {
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Eres Sofía, asistente comercial de Dopa. Tu trabajo es conversar por teléfono con un cliente potencial.

CONTEXTO DE LA LLAMADA: ${context}

INFORMACIÓN DE DOPA QUE DEBES CONOCER:
- Dopa es un ERP Agéntico: trabajadores digitales con IA que operan el negocio 24/7.
- Atiende clientes por WhatsApp, Instagram, Messenger y llamadas de voz.
- Crea y publica contenido en redes sociales automáticamente.
- Gestiona inventario, emite facturas electrónicas (SUNAT, SAT, DIAN) y concilia cuentas bancarias.
- Se conecta a más de 13,000 bancos vía Plaid para finanzas en tiempo real.
- Planes: Starter (gratis, 1 agente), Pro (setup único de $997 USD, hasta 5 agentes IA, Voice AI, facturación, e-commerce), y Dopa 360 (enterprise completo).
- WEB: dopa.solutions — ahí pueden ver demo y empezar prueba gratis de 14 días.
- Diferenciador: no es un chatbot. Los agentes ejecutan — cierran ventas, emiten facturas, publican contenido. Todo autónomo.

REGLAS DE CONVERSACIÓN:
1. Responde en español neutro LATAM, con voz cálida y profesional.
2. Sé breve — máximo 2-3 oraciones por respuesta. Es una conversación telefónica.
3. Si el cliente pregunta qué es Dopa, usa la info de arriba. NO inventes features.
4. Si el cliente muestra interés, ofrece agendar una demo en dopa.solutions o enviar info por WhatsApp.
5. Menciona los precios SOLO si el cliente pregunta explícitamente.
6. Si el cliente hace 2+ preguntas y responde positivamente, ofrece agendar una cita.
7. Si el cliente dice "adiós", "gracias", "nos vemos" o similar, despídete amablemente.
8. Si el cliente pregunta algo que no está en la info de arriba, sé honesta: "Déjame consultarlo con el equipo y te envío la información por WhatsApp."
9. Termina tu mensaje con [HANGUP] solo cuando la conversación haya concluido naturalmente.
10. NO uses [HANGUP] si el cliente aún está interesado o haciendo preguntas.`,
      },
      {
        role: 'user',
        content: `El cliente dijo: "${speechInput}"\n\nResponde como Sofía. Si la conversación terminó, incluye [HANGUP] al final de tu mensaje.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 150,
  });

  const content = response.choices[0]?.message?.content || 'Gracias por tu tiempo. Te envío la información por WhatsApp.';
  const hangUp = content.includes('[HANGUP]');
  const text = content.replace('[HANGUP]', '').trim();

  return { text, hangUp };
}
