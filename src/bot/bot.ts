import { Bot } from 'grammy';
import { config, isBotConfigured } from './config.js';
import { setupCommandHandlers } from './handlers/commands.js';
import { setupCallbackHandlers } from './handlers/callbacks.js';
import { setupMessageHandlers } from './handlers/messages.js';
import { statsManager } from './statsManager.js';
import { reminderService } from './services/reminderService.js';

let botInstance: Bot | null = null;

export function getBotInstance(): Bot {
  const currentToken = process.env.TELEGRAM_BOT_TOKEN || config.telegramToken || '123456789:DummyTokenForInitializingBotStructure';
  const isDummy = !currentToken || currentToken.includes('DummyToken');

  // Re-initialize if botInstance is null OR if token updated from dummy/old token
  if (!botInstance || (botInstance.token !== currentToken && !isDummy)) {
    const botOptions = isDummy ? {
      botInfo: {
        id: 777000123,
        is_bot: true,
        first_name: 'Floate AI Bot',
        username: 'FloateAIBot',
      } as any,
    } : undefined;

    botInstance = new Bot(currentToken, botOptions);

    // Prompt v2.0 Global Middleware to ensure every response starts with [PROMPT v2.0 ACTIVE]
    botInstance.use(async (ctx: any, next: any) => {
      const originalReply = ctx.reply.bind(ctx);
      ctx.reply = async (text: string, other: any) => {
        if (typeof text === 'string') {
          const cleanText = text.startsWith('[PROMPT v2.0 ACTIVE]') ? text : `[PROMPT v2.0 ACTIVE]\n\n${text}`;
          return originalReply(cleanText, other);
        }
        return originalReply(text, other);
      };
      await next();
    });

    // Global error handler
    botInstance.catch((err) => {
      const errorStr = String(err.error || err);
      if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
        console.warn('⚠️ Telegram Bot Warning (401 Unauthorized): Telegram token is invalid or unauthorized.');
        return;
      }
      if (errorStr.includes('409') || errorStr.includes('getUpdates') || errorStr.includes('Conflict')) {
        console.warn('⚠️ Telegram Polling Warning (409 Conflict): Another instance is currently polling this bot token.');
        return;
      }
      console.error('Error in Telegram bot execution:', err);
      statsManager.recordError();
    });

    // Register all handlers
    setupCommandHandlers(botInstance);
    setupCallbackHandlers(botInstance);
    setupMessageHandlers(botInstance);

    // Start daily morning reminder scheduler for registered businesses
    reminderService.startScheduler(botInstance);
  }

  return botInstance;
}

export { isBotConfigured };
