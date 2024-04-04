import { CustomerService, CustomerGroupService, TransactionBaseService, Customer } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { objectToAuthDataMap, AuthDataValidator } from "@telegram-auth/server";
import TelegramBot, { ChatMember } from "node-telegram-bot-api";

type Nullable<T> = T | null;

class TelegramAuthService extends TransactionBaseService {
  protected manager_: EntityManager;
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

  async processTelegramUser(data) {
    const statuses = {
      creator: true,
      administrator: true,
      member: true,
      restricted: true,
    };

    const dataObj = objectToAuthDataMap(data);
    const telegramUser = await this.validator_.validate(dataObj);

    //TODO - getTelegramGroup
    const customerGroups = await this.customerGroupService_.list({}, {});
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

    let customer: Nullable<Customer> = null;

    for (const telegramGroup of telegramGroups) {
      const { title } = await this.bot_.getChat(telegramGroup);
      const chatMember: Nullable<ChatMember> = await this.bot_.getChatMember(telegramGroup, telegramUser.id).catch(() => null);

      if (chatMember && statuses[chatMember.status]) {
        customer = await this.customerService_.retrieveRegisteredByEmail(`${telegramUser.id}@telegram.id`, { relations: ["groups"] }).catch(() => null);

        if (!customer) {
          customer = await this.customerService_.withTransaction(this.manager_).create({
            email: `${telegramUser.id}@telegram.id`,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
            phone: "",
            has_account: true,
          });
        }

        // TODO - add customer to group if not assigned
        if (customer.groups ?? [].every((group) => group.name !== title)) {
          await this.customerGroupService_.withTransaction(this.manager_).addCustomers(customerGroupsMap[title], [customer.id]);
        }
        // TODO - remove customer from group if not in telegram
      } else if (chatMember && !statuses[chatMember.status]) {
        const rejectedCustomer = await this.customerService_.retrieveRegisteredByEmail(`${telegramUser.id}@telegram.id`, { relations: ["groups"] });
        if (rejectedCustomer.groups.find((group) => group.name === title)) {
          await this.customerGroupService_.withTransaction(this.manager_).removeCustomer(customerGroupsMap[title], [rejectedCustomer.id]);
        }
      }
    }
    return customer;
  }
}

export default TelegramAuthService;
