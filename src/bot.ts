import TelegramBot from 'node-telegram-bot-api';
import { processMessage } from './agent.js';
import { initiateCall } from './call.js';

let telegramBot: TelegramBot | undefined;

/** Creates a bot in webhook mode. Express delivers updates through processUpdate. */
export function getTelegramBot(): TelegramBot {
  if (telegramBot) return telegramBot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN.');

  telegramBot = new TelegramBot(token, { polling: false });
  telegramBot.on('message', (message) => {
    if (!message.text) return;
    void handleTelegramMessage(message.chat.id, message.text).catch((error) => {
      console.error('[TELEGRAM] Message handler failed:', error);
    });
  });
  return telegramBot;
}

export function processTelegramUpdate(update: TelegramBot.Update): void {
  getTelegramBot().processUpdate(update);
}

/** Processes a Telegram text message, then replies or initiates the requested call. */
export async function handleTelegramMessage(chatId: number, text: string): Promise<void> {
  const bot = getTelegramBot();
  if (text === '/start') {
    await bot.sendMessage(chatId, '🤖 *TeleVoice Agent*\n\nDime a quién llamar y el motivo.\n\n*Ejemplo:*\n_Llama a +51979300062, está interesado en Dopa_', { parse_mode: 'Markdown' });
    return;
  }

  const result = await processMessage(text);
  if (result.action === 'reply') {
    await bot.sendMessage(chatId, result.message ?? '¿En qué puedo ayudarte?');
    return;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(result.phoneNumber)) {
    await bot.sendMessage(chatId, 'No pude validar el teléfono. Incluye el código de país, por ejemplo +51979300062.');
    return;
  }

  await bot.sendMessage(chatId, `📞 Iniciando llamada a ${result.phoneNumber}…\n\n*Motivo:* ${result.reason}`, { parse_mode: 'Markdown' });
  try {
    const callSid = await initiateCall({ phoneNumber: result.phoneNumber, prompt: result.reason });
    await bot.sendMessage(chatId, `✅ Llamada iniciada.\n\n*Twilio Call SID:* \`${callSid}\``, { parse_mode: 'Markdown' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    console.error('[TWILIO] Could not initiate call:', error);
    await bot.sendMessage(chatId, `❌ No se pudo iniciar la llamada: ${message}`);
  }
}