import twilio from 'twilio';

interface CallParams {
  phoneNumber: string;
  prompt: string;
}

/**
 * Initiates an outbound PSTN call via Twilio ConversationRelay.
 * The call recipient will talk to an AI voice agent that responds in Spanish.
 *
 * Callback URL uses /twiml which returns ConversationRelay TwiML.
 */
export async function initiateCall(params: CallParams): Promise<string> {
  const { phoneNumber, prompt } = params;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Missing Twilio credentials. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
  }

  const client = twilio(accountSid, authToken);

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

  const call = await client.calls.create({
    to: phoneNumber,
    from: fromNumber,
    url: `${baseUrl}/twiml?prompt=${encodeURIComponent(prompt)}`,
    statusCallback: `${baseUrl}/status`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['completed'],
    record: false,
  });

  console.log(`[TWILIO] Call initiated: ${call.sid} → ${phoneNumber}`);
  return call.sid;
}
