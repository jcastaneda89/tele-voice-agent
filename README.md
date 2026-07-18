# TeleVoice Agent — OpenAI Build Week 2026

**Track:** Work & Productivity  
**Built with:** Codex + GPT-5.6 during OpenAI Build Week (July 17-21, 2026)  
**Demo:** A Telegram bot that initiates real AI-powered voice calls via Twilio. You chat with the bot, it calls any phone number, and an autonomous AI agent has a natural voice conversation in Spanish.

## What it does

1. You message a Telegram bot: *"Llama a Juan al +51 979 300 062, está interesado en Dopa"*
2. The bot extracts the phone number and reason using GPT-5.6
3. Twilio places a real PSTN call to that number
4. The recipient answers and talks to an AI voice agent that presents Dopa, answers questions, and closes — autonomously

## How Codex + GPT-5.6 Built This

Every file in this repo was generated or significantly accelerated by Codex with GPT-5.6. Below is the session trace.

### Codex Sessions

| `/feedback` ID | What was built |
|----------------|---------------|
| `019f72b3-68e6-7c80-b9df-036b6df84938` | Telegram bot webhook handler + GPT-5.6 agent with function calling — message parsing, phone extraction, and call initiation |
| `019f72c8-0601-7612-a4e5-adebe90680eb` | Twilio voice integration — TwiML endpoints with `<Gather input="speech">` for Spanish conversations, Polly TTS, and callback loop |
| `019f72d1-60ed-7761-9ae6-2f4d53dda200` | Express server wiring — routes, webhook registration, error handling, async message processing, and ngrok setup |

### Key Decisions Made with Codex

- **Telegram over web UI:** Codex suggested Telegram bot as the fastest way to demo voice calls without building a frontend. Accepted — zero UI code needed.
- **Tool-calling pattern:** The agent uses GPT-5.6 function calling to decide when to initiate a call vs when to just reply. This keeps the LLM in control of the conversation flow.
- **Spanish voice with LATAM neutral tone:** The system prompt and ElevenLabs voice are configured for neutral Latin American Spanish — the market Dopa serves.
- **ConversationRelay over MediaStreams:** Codex recommended ConversationRelay because it handles STT/TTS natively, reducing integration complexity for a 4-day hackathon.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Messaging | Telegram Bot API (webhook mode) |
| AI Agent | GPT-5.6 (via OpenAI SDK) with tool calling |
| Voice | Twilio PSTN + ConversationRelay |
| TTS | ElevenLabs (Spanish LATAM voice) |
| Server | Node.js + Express + TypeScript |
| Tunnel | ngrok (local dev → public webhook URL) |

## Quick Start

### Prerequisites
- Node.js 18+
- Telegram Bot Token (from @BotFather)
- Twilio Account SID, Auth Token, and a phone number
- OpenAI API key (with GPT-5.6 access)
- ElevenLabs API key
- ngrok (for local dev)

### Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run dev
# In another terminal:
ngrok http 3000
# Set your Telegram webhook:
curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<ngrok-url>/webhook
```

### Environment Variables

```
TELEGRAM_BOT_TOKEN=your_bot_token
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
ELEVENLABS_API_KEY=sk_...
```

## Project Structure

```
src/
├── index.ts     ← Express server + Telegram webhook handler
├── bot.ts       ← Telegram message handling + GPT-5.6 agent
├── agent.ts     ← AI agent with tool calling
└── call.ts      ← Twilio voice call + ConversationRelay TwiML
```

## Demo Video

[YouTube link — 3-minute demo showing the full flow]

## Built by

José Castañeda — CEO & Founder, Dopa (dopa.solutions)  
During OpenAI Build Week 2026, July 17-21
