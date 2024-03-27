import { CustomerService, CustomerGroupService, TransactionBaseService, Customer } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";
import TelegramBot, { ChatMember } from "node-telegram-bot-api";
// import jwt from "jsonwebtoken";

// class CustomerNotAuthorizedError extends Error {
//   constructor() {
//     super("Customer not authorized.");
//     this.name = "CustomerNotAuthorizedError";
//   }
// }

class TelegramAuthService extends TransactionBaseService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  private botToken_: string;
  private bot_: TelegramBot;
  private validator_: AuthDataValidator;
  private customerService_: CustomerService;
  private customerGroupService_: CustomerGroupService;

  constructor(container) {
    super(container);
    this.botToken_ = process.env.BOT_TOKEN;
    this.customerService_ = container.customerService;
    this.customerGroupService_ = container.customerGroupService;
    this.bot_ = new TelegramBot(this.botToken_, { polling: false });
    this.validator_ = new AuthDataValidator({ botToken: this.botToken_ });
  }

  async processTelegramUser(data: any) {
    const statuses = {
      creator: true,
      administrator: true,
      member: true,
      restricted: true,
    };

    const dataObj = objectToAuthDataMap(data);
    const telegramUser = await this.validator_.validate(dataObj);
    const manager = this.manager_;
    const customerService = this.customerService_;
    const customerGroupService = this.customerGroupService_;

    const customerGroups = await customerGroupService.list({}, {});

    const customerGroupsMap = customerGroups.reduce((acc, group) => {
      acc[group.name] = group.id;
      return acc;
    }, {});
    const telegramGroups: string[] = customerGroups.reduce((acc, customerGroup) => {
      if (customerGroup.metadata && customerGroup.metadata.telegram_group) {
        acc.push(customerGroup.metadata.telegram_group);
      }
      return acc;
    }, []);

    let customer: Customer | null = null;

    for (const telegramGroup of telegramGroups) {
      const { title } = await this.bot_.getChat(telegramGroup);
      const chatMember: ChatMember | null = await this.bot_.getChatMember(telegramGroup, telegramUser.id).catch(() => null);

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

        if (customer.groups.every((group) => group.name !== title)) {
          await customerGroupService.withTransaction(manager).addCustomers(customerGroupsMap[title], [customer.id]);
        }
      } else if (chatMember && !statuses[chatMember.status]) {
        const rejectedCustomer = await customerService.retrieveByPhone(telegramUser.id.toString(), { relations: ["groups"] });
        if (rejectedCustomer.groups.find((group) => group.name === title)) {
          await customerGroupService.withTransaction(manager).removeCustomer(customerGroupsMap[title], [rejectedCustomer.id]);
        }
      }
    }
    // if (!customer) {
    //   throw new CustomerNotAuthorizedError();
    // }
    return customer;
  }
}

export default TelegramAuthService;
