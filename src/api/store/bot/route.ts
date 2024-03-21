import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import TelegramBot from "node-telegram-bot-api";

const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vipChatId = -4103272837;
  const plebsChatId = -4175941182;

  const telegramGroups = process.env.TELEGRAM_GROUPS;

  // for (const group of telegramGroups.split(",")) {
  //   const result = await bot.getChatMember(group.trim(), 5897870773).catch(() => null);
  //   if (result && (result.status === "creator" || result.status === "administrator" || result.status === "member" || result.status === "restricted")) {
  //     console.log(group, result.status);
  //     break;
  //   }
  // }
  const customerGroupService = req.scope.resolve("customerGroupService");
  const groupIdArray = await customerGroupService.list({}, { select: ["id", "name"] });

  console.log(groupIdArray);

  const groups = telegramGroups.split(",").map((group) => group.trim());

  const statuses = {
    creator: true,
    administrator: true,
    member: true,
    restricted: true,
  };

  for (const group of groups) {
    try {
      const result = await bot.getChatMember(group, 5897870773);
      if (statuses[result.status]) {
        console.log(group, result.status);
        break;
      }
    } catch (error) {
      console.log(`Error getting chat member for group ${group}`);
    }
  }

  return res.status(200).json({ status: "ok" });
}

// userId 750509452
// botId 5897870773
// botId left/member 7127931618
