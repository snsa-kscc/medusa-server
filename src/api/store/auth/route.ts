import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";
import TelegramBot from "node-telegram-bot-api";
import jwt from "jsonwebtoken";

class CustomerNotAuthorizedError extends Error {
  constructor() {
    super("Customer not authorized.");
    this.name = "CustomerNotAuthorizedError";
  }
}

const botToken = process.env.BOT_TOKEN;
const telegramGroups = process.env.TELEGRAM_GROUPS;
const bot = new TelegramBot(botToken, { polling: false });
const validator = new AuthDataValidator({
  botToken,
});

const telegramArray = telegramGroups.split(",").map((group) => group.trim());
const statuses = {
  creator: true,
  administrator: true,
  member: true,
  restricted: true,
};
let customer = null;

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const data = await req.body;
    const dataObj = objectToAuthDataMap(data);
    const telegramUser = await validator.validate(dataObj);
    const manager = req.scope.resolve("manager");
    const customerService = req.scope.resolve("customerService");
    const customerGroupService = req.scope.resolve("customerGroupService");

    const customerGroups = await customerGroupService.list();
    const customerGroupsMap = customerGroups.reduce((acc, group) => {
      acc[group.name] = group.id;
      return acc;
    }, {});

    for (const telegramGroup of telegramArray) {
      const { title } = await bot.getChat(telegramGroup);
      const chatMember = await bot.getChatMember(telegramGroup, telegramUser.id).catch(() => null);

      if (chatMember && statuses[chatMember.status]) {
        customer = await customerService.retrieveByPhone(telegramUser.id.toString(), { relations: ["groups"] }).catch(() => null);

        if (!customer) {
          customer = await customerService.withTransaction(manager).create({
            email: `${telegramUser.username}@telegram.telegramUser`,
            phone: telegramUser.id.toString(),
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
            has_account: true,
          });
        }

        customer.groups.every((group) => group.name !== title) &&
          (await customerGroupService.withTransaction(manager).addCustomers(customerGroupsMap[title], [customer.id]));
      } else if (chatMember && !statuses[chatMember.status]) {
        const rejectedCustomer = await customerService.retrieveByPhone(telegramUser.id.toString(), { relations: ["groups"] });
        if (rejectedCustomer.groups.find((group) => group.name === title)) {
          await customerGroupService.withTransaction(manager).removeCustomer(customerGroupsMap[title], [rejectedCustomer.id]);
        }
      }
    }

    if (!customer) {
      throw new CustomerNotAuthorizedError();
    }
    const { projectConfig } = req.scope.resolve("configModule");
    req.session.jwt_store = jwt.sign({ customer_id: customer.id, domain: "store" }, projectConfig.jwt_secret!, { expiresIn: "30d" });

    return res.status(200).json({ token: req.session.jwt_store });
  } catch (error) {
    if (error instanceof CustomerNotAuthorizedError) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
}
