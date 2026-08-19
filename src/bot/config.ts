import dotenv from 'dotenv';
dotenv.config();

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  spreadsheetId: process.env.SPREADSHEET_ID || '',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '',
  adminWhatsAppPhone: process.env.ADMIN_WHATSAPP_PHONE || '',
  appUrl: process.env.APP_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  // WhatsApp Cloud API (Meta Graph API)
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'floate_wa_verify_token_2026',
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  // Flutterwave Payment Gateway (AI Negotiator)
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
  flutterwavePublicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
  flutterwaveEncryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
  negotiatorFeeNaira: parseInt(process.env.NEGOTIATOR_FEE_NAIRA || '200', 10),
};

export const isBotConfigured = () => {
  return Boolean(config.telegramToken && config.telegramToken.length > 10);
};

export const isWhatsAppConfigured = () => {
  return Boolean(config.whatsappAccessToken && config.whatsappPhoneNumberId);
};

