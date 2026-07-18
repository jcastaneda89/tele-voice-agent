import express from 'express';
import dotenv from 'dotenv';
import { handleTelegramMessage } from './bot.js';
import { getAgentResponse } from './agent.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => {
  res.send('TeleVoice Agent — Running. Built with Codex + GPT-5.6 during OpenAI Build Week 2026.');
});

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      // Process (Telegram expects a quick 200, so we'll handle it below)
      try {
        await handleTelegramMessage(chatId, text);
      } catch (handlerErr) {
        console.error('[WEBHOOK] Handler error:', handlerErr);
      }
      res.status(200).send('ok');
    } else {
      res.status(200).send('ok');
    }
  } catch (err) {
    console.error('[WEBHOOK] Error:', err);
    res.status(200).send('ok'); // Always 200 to Telegram
  }
});

/**
 * Initial TwiML — starts the call with a greeting and prompts for speech input.
 */
app.post('/twiml', (req, res) => {
  const prompt = (req.query.prompt as string) || 'Contacto comercial.';
  const firstMessage = `¡Hola! Soy Sofía, asistente virtual de Dopa. Me comunico porque ${prompt}. ¿Me escuchas bien?`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lucia" language="es-MX">${escapeXml(firstMessage)}</Say>
  <Gather input="speech" language="es-MX" speechTimeout="2" action="/gather" method="POST">
    <Say voice="Polly.Lucia" language="es-MX">¿En qué puedo ayudarte?</Say>
  </Gather>
</Response>`;

  res.type('text/xml').send(twiml);
});

/**
 * Gather callback — processes the caller's speech, sends to GPT-5.6, and returns TwiML
 * with the agent's response. Loops until the agent decides to hang up or the caller
 * doesn't respond.
 */
app.post('/gather', async (req, res) => {
  const speechResult = req.body.SpeechResult;
  const promptParam = req.query.prompt as string || '';

  if (!speechResult) {
    // No speech detected — say goodbye and hang up
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lucia" language="es-MX">No escuché tu respuesta. ¡Gracias por tu tiempo! Te enviaré la información por WhatsApp.</Say>
</Response>`;
    res.type('text/xml').send(twiml);
    return;
  }

  console.log(`[CALL] Caller said: "${speechResult}"`);

  // Get GPT-5.6 response
  const aiResponse = await getAgentResponse(promptParam, speechResult);

  if (aiResponse.hangUp) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lucia" language="es-MX">${escapeXml(aiResponse.text)}</Say>
</Response>`;
    res.type('text/xml').send(twiml);
    return;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lucia" language="es-MX">${escapeXml(aiResponse.text)}</Say>
  <Gather input="speech" language="es-MX" speechTimeout="3" action="/gather?prompt=${encodeURIComponent(promptParam)}" method="POST">
    <Say voice="Polly.Lucia" language="es-MX">¿Algo más en lo que pueda ayudarte?</Say>
  </Gather>
</Response>`;

  res.type('text/xml').send(twiml);
});

/** Twilio call status callback — logs call completion events. */
app.post('/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`[TWILIO] Call ${CallSid}: ${CallStatus} (${CallDuration}s)`);
  res.status(200).send('ok');
});

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.listen(PORT, () => {
  console.log(`[TELE-VOICE] Server running on port ${PORT}`);
  console.log(`[TELE-VOICE] Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_NGROK_URL>/webhook`);
});
