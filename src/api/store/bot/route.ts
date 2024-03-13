import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import TelegramBot from "node-telegram-bot-api";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const botToken = process.env.BOT_TOKEN;
  const bot = new TelegramBot(botToken, { polling: true });
  const chatId = -4103272837;

  const result = await bot.getChatMember(chatId, 7127931618);
  console.log(result);

  return res.status(200).json({ status: "ok" });
}

// userId 750509452
// botId 5897870773
// botId left/member 7127931618
