import twilio from 'twilio';
import express from 'express';
import dotenv from 'dotenv';
import { getAgentResponse, type VoiceTurn } from './agent.js';
import { getTelegramBot, processTelegramUpdate } from './bot.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3456);
const callHistories = new Map<string, VoiceTurn[]>();
const missedSpeechCounts = new Map<string, number>();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => res.send('TeleVoice Agent is running.'));

/** Telegram webhook endpoint for node-telegram-bot-api's processUpdate pattern. */
app.post('/webhook', (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const suppliedSecret = req.header('x-telegram-bot-api-secret-token');
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    res.sendStatus(401);
    return;
  }

  try {
    processTelegramUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('[TELEGRAM] Invalid webhook update:', error);
    res.sendStatus(200); // Telegram retries non-2xx responses.
  }
});

app.post('/twiml', (req, res) => {
  const prompt = getPrompt(req.query.prompt);
  const greeting = `Hola, soy Sofía, asistente virtual de Dopa. Me comunico porque ${prompt}. ¿Me escuchas bien?`;
  res.type('text/xml').send(gatherResponse(greeting, prompt));
});

app.post('/gather', async (req, res) => {
  const speechResult = req.body.SpeechResult as string | undefined;
  const prompt = getPrompt(req.query.prompt);
  const callSid = req.body.CallSid as string | undefined;
  if (!speechResult) {
    const misses = callSid ? (missedSpeechCounts.get(callSid) ?? 0) + 1 : 2;
    if (callSid) missedSpeechCounts.set(callSid, misses);
    if (misses < 2) {
      res.type('text/xml').send(gatherResponse('No logré escucharte. Por favor, responde después del tono.', prompt));
      return;
    }
    clearCallState(callSid);
    res.type('text/xml').send(hangupResponse('No logré escucharte. Gracias por tu tiempo. Hasta luego.'));
    return;
  }

  if (callSid) missedSpeechCounts.delete(callSid);

  try {
    const history = callSid ? (callHistories.get(callSid) ?? []) : [];
    const aiResponse = await getAgentResponse(prompt, speechResult, history);
    if (callSid && !aiResponse.hangUp) {
      callHistories.set(callSid, [...history, { role: 'user' as const, content: speechResult }, { role: 'assistant' as const, content: aiResponse.text }].slice(-12));
    }
    if (aiResponse.hangUp) {
      clearCallState(callSid);
      res.type('text/xml').send(hangupResponse(aiResponse.text));
      return;
    }
    res.type('text/xml').send(gatherResponse(aiResponse.text, prompt, '¿Algo más en lo que pueda ayudarte?'));
  } catch (error) {
    console.error('[CALL] Gather handler failed:', error);
    clearCallState(callSid);
    res.type('text/xml').send(hangupResponse('Lo siento, ocurrió un error. Gracias por tu tiempo.'));
  }
});

app.post('/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`[TWILIO] Call ${CallSid}: ${CallStatus} (${CallDuration ?? 0}s)`);
  if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus) && CallSid) {
    clearCallState(CallSid);
  }
  res.sendStatus(200);
});

function getPrompt(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Contacto comercial.';
}

function gatherResponse(message: string, prompt: string, gatherPrompt = 'Cuéntame, ¿en qué puedo ayudarte?'): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'Polly.Lucia', language: 'es-MX' }, message);
  const gather = response.gather({
    input: ['speech'],
    language: 'es-MX',
    speechTimeout: '3',
    actionOnEmptyResult: true,
    action: `/gather?prompt=${encodeURIComponent(prompt)}`,
    method: 'POST',
  });
  gather.say({ voice: 'Polly.Lucia', language: 'es-MX' }, gatherPrompt);
  return response.toString();
}

function hangupResponse(message: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'Polly.Lucia', language: 'es-MX' }, message);
  response.hangup();
  return response.toString();
}

function clearCallState(callSid: string | undefined): void {
  if (!callSid) return;
  callHistories.delete(callSid);
  missedSpeechCounts.delete(callSid);
}

app.listen(port, async () => {
  console.log(`[TELE-VOICE] Server running on port ${port}`);
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('[TELEGRAM] TELEGRAM_BOT_TOKEN is not configured; webhook processing is disabled.');
    return;
  }
  try {
    const appUrl = process.env.APP_URL;
    if (appUrl) {
      await getTelegramBot().setWebHook(`${appUrl.replace(/\/$/, '')}/webhook`, {
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      });
      console.log('[TELEGRAM] Webhook registered.');
    } else {
      console.warn('[TELEGRAM] Set APP_URL to register the webhook automatically.');
    }
  } catch (error) {
    console.error('[TELEGRAM] Webhook registration failed:', error);
  }
});