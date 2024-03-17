import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";

import jwt from "jsonwebtoken";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const validator = new AuthDataValidator({
    botToken: process.env.BOT_TOKEN,
  });

  const data = await req.body;
  const dataObj = objectToAuthDataMap(data);
  const telegramUser = await validator.validate(dataObj);

  const manager = req.scope.resolve("manager");
  const customerService = req.scope.resolve("customerService");
  const customerGroupService = req.scope.resolve("customerGroupService");

  const result1 = await customerGroupService.retrieve("cgrp_01HS6TK3W02RHWXVPSFMNS2DNS", { relations: ["customers"] });
  const result2 = await customerService.retrieve("cus_01HS73G7RM7S6188808B213NBB", { relations: ["groups"] });

  let customer = await customerService.retrieveByPhone(telegramUser.id.toString()).catch(() => null);

  if (!customer) {
    customer = await customerService.withTransaction(manager).create({
      email: `${telegramUser.username}@telegram.telegramUser`,
      phone: telegramUser.id.toString(),
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      has_account: true,
    });
  }

  const { projectConfig } = req.scope.resolve("configModule");
  req.session.jwt_store = jwt.sign({ customer_id: customer.id, domain: "store" }, projectConfig.jwt_secret!, { expiresIn: "30d" });

  return res.status(200).json({ token: req.session.jwt_store });
}
