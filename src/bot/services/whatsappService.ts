import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { firestoreDb } from './firestoreService.js';

let waLogs: string[] = [];

export function pushWaLog(log: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${log}`;
  waLogs.unshift(entry);
  if (waLogs.length > 50) waLogs.pop();
  (globalThis as any).__RECENT_WA_LOGS = waLogs;
  console.log(entry);
}

export interface SendWhatsAppOptions {
  preview_url?: boolean;
  ctaUrl?: {
    displayText: string;
    url: string;
    headerText?: string;
    footerText?: string;
  };
  quickReplies?: Array<{ id: string; title: string }>;
}

/**
 * Sends a message back to a WhatsApp user via Meta's WhatsApp Cloud API
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  messageText: string,
  options?: SendWhatsAppOptions
): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || config.whatsappAccessToken;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || config.whatsappPhoneNumberId;

  const cleanTo = toPhone.replace(/\D/g, '');

  if (messageText && !messageText.startsWith('[PROMPT v2.0 ACTIVE]')) {
    messageText = `[PROMPT v2.0 ACTIVE]\n\n${messageText}`;
  }

  pushWaLog(`📤 Outgoing request to +${cleanTo}: ${messageText.slice(0, 60)}...`);

  if (!token || !phoneNumberId) {
    pushWaLog(`❌ FAILED: Token or Phone Number ID is missing!`);
    return false;
  }

  try {
    let payload: any = {
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'text',
      text: {
        body: messageText,
        preview_url: options?.preview_url ?? true,
      },
    };

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      pushWaLog(`❌ Meta WhatsApp API Error: ${JSON.stringify(data)}`);
      return false;
    }

    pushWaLog(`✅ Message delivered successfully to +${cleanTo}`);
    return true;
  } catch (err: any) {
    pushWaLog(`❌ Network error sending WhatsApp message: ${err?.message || err}`);
    return false;
  }
}

/**
 * Triggers WhatsApp native typing indicator
 */
export async function sendWhatsAppTypingIndicator(messageId: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || config.whatsappAccessToken;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || config.whatsappPhoneNumberId;
  if (!token || !phoneNumberId || !messageId) return;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    }).catch(() => {});
  } catch {}
}

/**
 * Meta WhatsApp Webhook Verification (GET)
 */
export function handleWhatsAppVerification(req: express.Request, res: express.Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || config.whatsappVerifyToken || 'floate_wa_verify_token_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('✅ WhatsApp Webhook verified successfully by Meta!');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ WhatsApp Webhook verification failed. Token mismatch.');
    res.sendStatus(403);
  }
}

/**
 * Meta WhatsApp Webhook POST Incoming Messages Ingress Handler
 */
export async function handleWhatsAppWebhook(req: express.Request, res: express.Response) {
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const contacts = value?.contacts || [];
        const messages = value?.messages || [];

        for (const message of messages) {
          const senderPhone = message.from; // e.g. "2348012345678"
          const messageId = message.id;
          const contact = contacts.find((c: any) => c.wa_id === senderPhone);
          const senderName = contact?.profile?.name || 'Customer';
          const msgType = message.type;

          if (messageId) {
            sendWhatsAppTypingIndicator(messageId).catch(() => {});
          }

          let rawText = '';
          if (msgType === 'text') {
            rawText = message.text?.body || '';
          } else if (msgType === 'interactive') {
            const buttonReply = message.interactive?.button_reply;
            const listReply = message.interactive?.list_reply;
            rawText = buttonReply?.id || listReply?.id || buttonReply?.title || listReply?.title || '';
          } else if (msgType === 'button') {
            rawText = message.button?.payload || message.button?.text || '';
          } else if (msgType === 'image') {
            rawText = message.image?.caption || 'Image message';
          } else if (msgType === 'audio' || msgType === 'voice') {
            rawText = 'Voice note message';
          }

          if (rawText) {
            await processMasterWhatsAppEngine({
              senderPhone,
              senderName,
              text: rawText,
            }).catch((err) => {
              console.error(`[WhatsApp Engine Error] +${senderPhone}:`, err);
            });
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`[WhatsApp Ingress Fatal Error]:`, err?.message || err);
  }
}

const SYSTEM_PROMPT_V2 = `
[PROMPT v2.0 ACTIVE]
You are FLOATE AI, a smart, friendly assistant for Nigerian commerce. You talk like a sharp, helpful Nigerian friend — warm, direct, no fluff, no corporate speak, no robotic language. 
Your core mission is to help buyers find verified products/services and connect them directly with verified merchants in Nigeria, and help merchants register and manage their listings.

ALWAYS respond in valid JSON format with these exact fields:
{
  "text": "The message text to send to user",
  "buttons": [
    [
      { "text": "Button 1", "callback_data": "action_1" },
      { "text": "Button 2", "callback_data": "action_2" }
    ]
  ],
  "action": "welcome|search|onboard|chat|end_chat|none",
  "next_step": "ask_name|ask_business|search_results|connected|done"
}
If you have no buttons, set buttons to null. Never respond with plain text outside JSON.
`.trim();

async function generateContentWithModelFallback(ai: GoogleGenAI, geminiInput: string, systemPrompt: string) {
  const modelsToTry = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
  ];

  let lastErr: any = null;
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: geminiInput,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        },
      });
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Gemini Fallback] Model "${modelName}" failed/quota exceeded (${err?.message || err}). Trying next model...`);
    }
  }
  throw lastErr;
}

/**
 * PURE GEMINI WEBHOOK ENGINE FOR FLOATE ON WHATSAPP (JSON Output, User Schema & Quota Fallback)
 */
export async function processMasterWhatsAppEngine(params: {
  senderPhone: string;
  senderName: string;
  text: string;
}) {
  const { senderPhone, senderName } = params;
  const text = params.text.trim();

  try {
    // 1. Fetch user context from Firestore (users/{userId} schema)
    const existingUser = await firestoreDb.getUserState(senderPhone).catch(() => null);
    const merchant = await firestoreDb.getMerchant(senderPhone).catch(() => null);
    const isNewUser = !existingUser;

    const userDoc = existingUser || {
      telegram_id: null,
      whatsapp_id: senderPhone,
      full_name: senderName !== 'Customer' ? senderName : null,
      phone: senderPhone,
      type: merchant ? 'merchant' : null,
      current_step: null,
      onboarding_progress: 0,
      business_id: merchant ? merchant.id : null,
      search_history: [],
      credits: 0,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
      is_new: true,
    };

    // 2. Build prompt for Gemini with user context
    const geminiInput = `
User ID: ${senderPhone}
Sender Name: ${senderName}
Is New User: ${isNewUser}
User Type: ${userDoc.type || 'unknown'}
Current Step: ${userDoc.current_step || 'none'}
Recent Searches: ${JSON.stringify(userDoc.search_history?.slice(-3) || [])}
Message: "${text}"
    `.trim();

    // 3. Call Gemini with automatic model fallback across available quotas
    const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing');
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await generateContentWithModelFallback(ai, geminiInput, SYSTEM_PROMPT_V2);

    const rawOutput = response.text || '{}';
    let parsed: {
      text?: string;
      buttons?: any;
      action?: string;
      next_step?: string;
    } = {};

    try {
      const clean = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { text: rawOutput, buttons: null, action: 'chat', next_step: null };
    }

    const responseText = parsed.text || 'Hello! How can I help you on Floate today?';
    
    // 4. Ensure [PROMPT v2.0 ACTIVE] prefix
    const finalResponse = responseText.startsWith('[PROMPT v2.0 ACTIVE]')
      ? responseText
      : `[PROMPT v2.0 ACTIVE]\n\n${responseText}`;

    // 5. Send response back to user
    await sendWhatsAppMessage(senderPhone, finalResponse);

    // 6. Update user document in Firestore according to schema
    const searchHistory = userDoc.search_history || [];
    if (parsed.action === 'search' && text) {
      searchHistory.push(text);
    }

    const updatedUserDoc = {
      ...userDoc,
      full_name: userDoc.full_name || (senderName !== 'Customer' ? senderName : null),
      current_step: parsed.next_step || null,
      search_history: searchHistory.slice(-20),
      last_active: new Date().toISOString(),
      is_new: false,
    };

    await firestoreDb.upsertUserState(senderPhone, updatedUserDoc);

  } catch (error: any) {
    console.error('Webhook error / Quota exceeded:', error);
    const errStr = error?.message || String(error);
    if (errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) {
      await sendWhatsAppMessage(
        senderPhone,
        `⚠️ *Floate AI Quota Notice*\n\nWe are currently experiencing heavy traffic and temporary Gemini API quota limits. Please try your message again in a few moments!`
      );
    } else {
      await sendWhatsAppMessage(senderPhone, 'Something went wrong. Please try again.');
    }
  }
}
