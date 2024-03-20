import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";
import TelegramBot from "node-telegram-bot-api";
import jwt from "jsonwebtoken";

const botToken = process.env.BOT_TOKEN;
const telegramGroups = process.env.TELEGRAM_GROUPS;
const bot = new TelegramBot(botToken, { polling: false });
const validator = new AuthDataValidator({
  botToken,
});

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const data = await req.body;
    const dataObj = objectToAuthDataMap(data);
    const telegramUser = await validator.validate(dataObj);

    const manager = req.scope.resolve("manager");
    const customerService = req.scope.resolve("customerService");
    const customerGroupService = req.scope.resolve("customerGroupService");

    const result1 = await customerGroupService.retrieve("cgrp_01HS6TK3W02RHWXVPSFMNS2DNS", { relations: ["customers"] });

    const telegramArray = telegramGroups.split(",").map((group) => group.trim());

    const statuses = {
      creator: true,
      administrator: true,
      member: true,
      restricted: true,
    };

    let customer = null;
    for (const group of telegramArray) {
      const { title } = await bot.getChat(group);

      const result = await bot.getChatMember(group, telegramUser.id).catch(() => null);

      if (result && statuses[result.status]) {
        // TODO: suboptimal code, hits the database multiple times
        customer = await customerService.retrieveByPhone(telegramUser.id.toString()).catch(() => null);

        if (!customer) {
          customer = await customerService.withTransaction(manager).create({
            email: `${telegramUser.username}@telegram.telegramUser`,
            phone: telegramUser.id.toString(),
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
            has_account: true,
          });
        }
        const { groups } = await customerService.retrieve(customer.id, { relations: ["groups"] });
        const groupIdArray = await customerGroupService.list({ name: title }, { select: ["id"] });
        groups.every((group) => group.name !== title) && (await customerGroupService.addCustomers(groupIdArray[0].id, [customer.id]));
      }
    }

    const { projectConfig } = req.scope.resolve("configModule");
    if (customer) {
      req.session.jwt_store = jwt.sign({ customer_id: customer.id, domain: "store" }, projectConfig.jwt_secret!, { expiresIn: "30d" });
    }

    //TODO: suboptimal code - unauthenticated route
    return res.status(200).json({ token: req.session.jwt_store });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
