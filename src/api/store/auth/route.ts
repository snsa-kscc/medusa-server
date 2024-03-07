import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const validator = new AuthDataValidator({
    botToken: process.env.BOT_TOKEN,
  });

  const data = await req.body;
  const dataObj = objectToAuthDataMap(data);
  const user = await validator.validate(dataObj);

  console.log(user);

  return res.json({ ok: true });
}
