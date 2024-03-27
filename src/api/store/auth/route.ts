import { Customer, MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import jwt from "jsonwebtoken";

class CustomerNotAuthorizedError extends Error {
  constructor() {
    super("Customer not authorized.");
    this.name = "CustomerNotAuthorizedError";
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const data = await req.body;
    const telegramAuthService = req.scope.resolve("telegramAuthService");
    const customer: Customer | null = await telegramAuthService.processTelegramUser(data);

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
