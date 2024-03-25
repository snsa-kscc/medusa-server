import { CustomerService, CustomerGroupService, TransactionBaseService } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";
import TelegramBot from "node-telegram-bot-api";
import jwt from "jsonwebtoken";

class TelegramAuthService extends TransactionBaseService {
  protected manager: EntityManager;
  protected transactionManager: EntityManager;
  private bot_: TelegramBot;
  private validator_: AuthDataValidator;
  private customerService: CustomerService;
  private customerGroupService: CustomerGroupService;

  constructor(container) {
    super(container);
    this.customerService = container.customerService;
    this.customerGroupService = container.customerGroupService;
  }
  async getCustomerGroups() {
    const res = await this.customerGroupService.list({}, {});
    return res;
  }
}

export default TelegramAuthService;
