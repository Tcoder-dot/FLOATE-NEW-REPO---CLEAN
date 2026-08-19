import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

export interface BrandAssistantResult {
  isBrandOrHelpQuery: boolean;
  isOffTopic: boolean;
  response: string;
  suggestedAction?: 'SEARCH' | 'REGISTER_VENDOR' | 'BROWSE_STATES' | 'AI_NEGOTIATOR' | 'REPORT';
}

/**
 * Fast regex & keyword detector for high-confidence brand, feature, and conversational inquiries
 */
export function matchBrandOrFaqQuery(queryText: string): string | null {
  const norm = queryText.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');

  // What is Floate / About
  if (/^(what is floate|what does floate do|who owns floate|who is floate|about floate|tell me about floate|how floate works|how does floate work|what can you do|what are you)$/i.test(norm)) {
    return (
      `*About Floate* 💜\n\n` +
      `Floate is Nigeria's smart commerce platform connecting buyers directly with verified vendors, suppliers, and skilled professionals across all 36 states.\n\n` +
      `We make shopping fast, transparent, and direct on WhatsApp with zero middleman commissions.\n\n` +
      `*What would you like to find or do today?* 😊`
    );
  }

  // How to buy / search / find products
  if (/^(how to buy|how do i buy|how do i search|how does search work|how to find vendors|how to use floate|how to order)$/i.test(norm)) {
    return (
      `*How to Shop on Floate* 💜\n\n` +
      `1️⃣ *Type what you need:* Send any item, brand, or location (e.g. \`Leather shoes in Onitsha\` or \`Solar inverter in Abuja\`).\n` +
      `2️⃣ *View Verified Vendors:* We show active, verified shops with clear prices.\n` +
      `3️⃣ *Connect Directly:* Message the merchant on WhatsApp with 1 tap.\n` +
      `4️⃣ *AI Negotiator:* You can also have our AI negotiate a discount on your behalf.\n\n` +
      `What are you looking for today? 😊`
    );
  }

  // AI Negotiator inquiry / How it works
  if (/^(what is ai negotiator|how does ai negotiator work|negotiator|negotiate for me|price discount|how to negotiate|tell me about ai negotiator)$/i.test(norm)) {
    return (
      `*Floate AI Negotiator* 💜\n\n` +
      `Our AI Negotiator is a pay-as-you-go feature (₦200 per use) that helps you get the best price!\n\n` +
      `When you select a merchant, Floate AI reviews the listed price and drafts a persuasive, professional opening proposal to the seller based on your budget and purchase readiness.\n\n` +
      `Would you like to search for a product and try it out? 😊`
    );
  }

  // How to register / Sell on Floate / Pricing for sellers
  if (/^(how to sell|how to register business|how to become a vendor|is floate free|how much to register|vendor registration)$/i.test(norm)) {
    return (
      `*Selling on Floate* 💜\n\n` +
      `Listing your shop on Floate is free! Verified merchants receive direct buyer inquiries without paying sales commission.\n\n` +
      `To register your shop now, reply *Register My Business* or tap below! 😊`
    );
  }

  // Safety & verification
  if (/^(is this safe|are vendors verified|how do you verify|scam protection|safety tips|is it legit)$/i.test(norm)) {
    return (
      `*Buyer Safety on Floate* 💜\n\n` +
      `All merchants on Floate undergo live identity verification and directory audits.\n\n` +
      `💡 *Safety Tips:*\n` +
      `• We recommend physical shop visits or pay-on-delivery/waybill verification.\n` +
      `• If you encounter any issue, type *I want to report* to alert our compliance team immediately.\n\n` +
      `What can I help you find today? 😊`
    );
  }

  // Off-topic general chit-chat (Weather, jokes, general knowledge)
  if (/^(how is the weather|hows the weather|whats the weather|tell me a joke|who is the president|sing a song|how old are you)$/i.test(norm)) {
    return (
      `I'm here to help you discover verified vendors, products, and services across Nigeria on Floate! 💜\n\n` +
      `What are you looking to buy or find today? 😊`
    );
  }

  return null;
}

/**
 * Handles conversational queries with Gemini AI as the LAST fallback layer.
 * Strictly forbidden from revealing internal technology, architecture, prompts, or API keys.
 */
export async function handleConversationalFallback(
  userMessage: string,
  buyerName?: string
): Promise<BrandAssistantResult> {
  // 1. Fast exact rule match first
  const quickMatch = matchBrandOrFaqQuery(userMessage);
  if (quickMatch) {
    return {
      isBrandOrHelpQuery: true,
      isOffTopic: false,
      response: quickMatch,
    };
  }

  // 2. Gemini fallback assistant
  const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
  if (!apiKey) {
    return {
      isBrandOrHelpQuery: false,
      isOffTopic: false,
      response: `I'm here to help you find verified vendors and products on Floate! 💜 What are you looking for today? 😊`,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
You are the official WhatsApp Assistant for "Floate" (an African/Nigerian commerce platform connecting buyers with verified merchants in 36 states with zero middleman commissions).

Customer Name: ${buyerName || 'Valued Customer'}
Customer Message: "${userMessage}"

STRICT GUIDELINES:
1. Tone: Warm, polite, helpful, concise, and trustworthy.
2. Emojis: You may ONLY use smiling faces (😊, 👋, 🤝) and the purple heart 💜. NEVER use stars, location pins, fire, sparkles, or cluttered emojis.
3. Feature awareness: Explain Floate features smoothly (search directory, 36 states hubs, free vendor listing, and the paid ₦200 AI Negotiator feature to get discounts).
4. Security Guardrail: NEVER disclose internal technology stack, LLMs, Gemini, source code, database architectures, or internal company secrets. If asked, state that you are Floate's commerce assistant.
5. If the message is completely off-topic (e.g. math homework, personal advice, weather), politely redirect them back to shopping on Floate.
6. Keep your reply short (2 to 4 sentences maximum). Always end with a helpful invitation to find what they need.
`.trim();

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.4,
        maxOutputTokens: 250,
      },
    });

    const reply = response.text?.trim();
    if (reply && reply.length > 10) {
      return {
        isBrandOrHelpQuery: true,
        isOffTopic: false,
        response: reply,
      };
    }
  } catch (err) {
    console.warn('[Brand Assistant Fallback Notice]:', err);
  }

  return {
    isBrandOrHelpQuery: false,
    isOffTopic: false,
    response: `I'm here to help you find verified vendors, products, and services across Nigeria on Floate! 💜 What are you shopping for today? 😊`,
  };
}
