import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import TelegramBot from "node-telegram-bot-api";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const botToken = process.env.BOT_TOKEN;
  const bot = new TelegramBot(botToken, { polling: true });
  const vipChatId = -4103272837;
  const plebsChatId = -4175941182;

  const telegramGroups = process.env.TELEGRAM_GROUPS;

  for (const group of telegramGroups.split(",")) {
    const result = await bot.getChatMember(group.trim(), 7127931618).catch(() => null);
    if (result && (result.status === "creator" || result.status === "administrator" || result.status === "member")) {
      console.log(group, result.status);
      break;
    }
  }

  return res.status(200).json({ status: "ok" });
}

// userId 750509452
// botId 5897870773
// botId left/member 7127931618
