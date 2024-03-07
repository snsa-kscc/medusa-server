import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const validator = new AuthDataValidator({
    botToken: process.env.BOT_TOKEN,
  });

  const data = await req.body;
  const dataObj = objectToAuthDataMap(data);
  const user = await validator.validate(dataObj);

  const manager = req.scope.resolve("manager");
  const customerService = req.scope.resolve("customerService");

  let customer = await customerService.retrieveByPhone(user.id.toString()).catch(() => null);

  if (!customer) {
    customer = await customerService.withTransaction(manager).create({
      email: `${user.username}@telegram.user`,
      phone: user.id.toString(),
      first_name: user.first_name,
      last_name: user.last_name,
      has_account: true,
    });
  }

  return res.json({ ok: true });
}
