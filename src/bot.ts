import { processMessage } from './agent.js';
import { initiateCall } from './call.js';

/**
 * Telegram bot message handler.
 * Receives a message, processes it with GPT-5.6, and initiates a voice call
 * if the agent determines one is needed.
 */
export async function handleTelegramMessage(chatId: number, text: string): Promise<void> {
  console.log(`[TELEGRAM] Message from ${chatId}: "${text}"`);

  // Handle /start command
  if (text === '/start') {
    await sendTelegramMessage(chatId,
      `🤖 *TeleVoice Agent* — Built with Codex + GPT-5.6\n\n` +
      `Inicio llamadas con IA por teléfono real. Solo dime a quién llamar y por qué.\n\n` +
      `*Ejemplo:*\n` +
      `_Llama a +51979300062 está interesado en Dopa_\n\n` +
      `El agente llamará, se presentará como Sofía, y conversará en español sobre lo que necesites.\n\n` +
      `*OpenAI Build Week 2026* · Work & Productivity Track`
    );
    return;
  }

  // Step 1: Process with GPT-5.6 agent to extract phone number and intent
  const result = await processMessage(text);
  console.log('[AGENT] Result:', JSON.stringify(result));

  if (result.action === 'call' && result.phoneNumber) {
    // Step 2: Send confirmation to Telegram
    await sendTelegramMessage(
      chatId,
      `📞 Iniciando llamada a ${result.phoneNumber}...\n\n*Motivo:* ${result.reason || 'Contacto comercial'}\n\nEl agente de IA se comunicará en español.`
    );

    // Step 3: Initiate the call via Twilio
    try {
      const callSid = await initiateCall({
        phoneNumber: result.phoneNumber,
        prompt: result.reason || 'Contacto comercial — presentar Dopa, resolver dudas y avanzar al cierre.',
      });

      await sendTelegramMessage(
        chatId,
        `✅ ¡Llamada iniciada!\n\n*Twilio Call SID:* \`${callSid}\`\n*Estado:* ringing\n\nEl destinatario recibirá la llamada en breve.`
      );
    } catch (err: any) {
      console.error('[CALL] Failed:', err.message);
      await sendTelegramMessage(
        chatId,
        `❌ Error al iniciar la llamada: ${err.message}`
      );
    }
  } else if (result.action === 'reply') {
    await sendTelegramMessage(chatId, result.message || 'Entendido. ¿En qué más puedo ayudarte?');
  } else {
    await sendTelegramMessage(
      chatId,
      '🤔 No entendí bien. Pruébame con algo como:\n\n*"Llama a Juan al +51 979 300 062, está interesado en Dopa"*\n\nIncluye el número de teléfono y el motivo de la llamada.'
    );
  }
}

/** Sends a message back to Telegram. Supports markdown. */
async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[TELEGRAM] Missing TELEGRAM_BOT_TOKEN');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (!data.ok) {
      console.error('[TELEGRAM] API error:', data.description);
    }
  } catch (err: any) {
    console.error('[TELEGRAM] Network error:', err.message);
  }
}
