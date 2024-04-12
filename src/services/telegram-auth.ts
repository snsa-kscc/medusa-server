import { CustomerService, CustomerGroupService, TransactionBaseService, Customer, CustomerGroup } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import { objectToAuthDataMap, AuthDataValidator, TelegramUserData } from "@telegram-auth/server";
import TelegramBot, { ChatMember } from "node-telegram-bot-api";

// Define a generic for nullable values
type Nullable<T> = T | null;

// Define a mapping for customer groups
type CustomerGroupsMap = {
  [groupName: string]: string;
};

// Define a custom type for customer groups including metadata
type CustomCustomerGroup = CustomerGroup & {
  metadata: {
    telegram_group?: string;
  };
};

// Class responsible for managing Telegram authentication
class TelegramAuthService extends TransactionBaseService {
  protected manager_: EntityManager;
  private botToken_: string;
  private bot_: TelegramBot;
  private validator_: AuthDataValidator;
  private customerService_: CustomerService;
  private customerGroupService_: CustomerGroupService;

  // Constructor to initialize the TelegramAuthService
  constructor(container) {
    super(container);
    this.botToken_ = process.env.BOT_TOKEN;
    this.customerService_ = container.customerService;
    this.customerGroupService_ = container.customerGroupService;
    this.bot_ = new TelegramBot(this.botToken_, { polling: false });
    this.validator_ = new AuthDataValidator({ botToken: this.botToken_ });
  }

  // Method to fetch Telegram user data
  async getTelegramUser(data): Promise<TelegramUserData> {
    const dataObj = objectToAuthDataMap(data);
    return await this.validator_.validate(dataObj);
  }

  // Method to fetch Medusa customer groups and map them
  async getCustomerGroupsAndMap(): Promise<{ customerGroupsMap: CustomerGroupsMap; telegramGroups: string[] }> {
    const customerGroups = await this.customerGroupService_.list({}, {});

    const customerGroupsMap: CustomerGroupsMap = customerGroups.reduce((acc: CustomerGroupsMap, group) => {
      acc[group.name] = group.id;
      return acc;
    }, {});

    const telegramGroups: string[] = customerGroups.reduce((acc: string[], customerGroup: CustomCustomerGroup) => {
      if (customerGroup.metadata && customerGroup.metadata.telegram_group) {
        acc.push(customerGroup.metadata.telegram_group);
      }
      return acc;
    }, []);

    return { customerGroupsMap, telegramGroups };
  }

  // Method to add Medusa customer to a group if s/he is not already a group member
  async addCustomerToGroup(customer: Customer, groupId: CustomerGroupsMap, title: string): Promise<void> {
    if (customer.groups ?? [].every((group) => group.name !== title)) {
      await this.customerGroupService_.withTransaction(this.manager_).addCustomers(groupId[title], [customer.id]);
    }
  }

  // Method to remove Medusa customer from a group if s/he is a group member
  async removeCustomerFromGroup(groupId: CustomerGroupsMap, title: string, telegramUser: TelegramUserData): Promise<void> {
    const rejectedCustomer = await this.customerService_.retrieveRegisteredByEmail(`${telegramUser.id}@telegram.id`, { relations: ["groups"] });
    if (rejectedCustomer.groups.find((group) => group.name === title)) {
      await this.customerGroupService_.withTransaction(this.manager_).removeCustomer(groupId[title], [rejectedCustomer.id]);
    }
  }

  // Method to process Telegram user data
  async processTelegramUser(data): Promise<Nullable<Customer>> {
    // Define user statuses that allow access
    const statuses = {
      creator: true,
      administrator: true,
      member: true,
      restricted: true,
    };

    const telegramUser = await this.getTelegramUser(data);
    const { customerGroupsMap, telegramGroups } = await this.getCustomerGroupsAndMap();

    let customer: Nullable<Customer> = null;

    for (const telegramGroup of telegramGroups) {
      // Get the title of the Telegram group
      const { title } = await this.bot_.getChat(telegramGroup);
      // Get information about the user's membership in the Telegram group
      const chatMember: Nullable<ChatMember> = await this.bot_.getChatMember(telegramGroup, telegramUser.id).catch(() => null);

      // Check if the user is a member of the Teleghram group and has an allowed status
      if (chatMember && statuses[chatMember.status]) {
        // Retrieve a customer associated with the Telegram user
        customer = await this.customerService_.retrieveRegisteredByEmail(`${telegramUser.id}@telegram.id`, { relations: ["groups"] }).catch(() => null);

        // Create a new customer if not found
        if (!customer) {
          customer = await this.customerService_.withTransaction(this.manager_).create({
            email: `${telegramUser.id}@telegram.id`,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
            phone: "",
            has_account: true,
          });
        }

        await this.addCustomerToGroup(customer, customerGroupsMap, title);
        // Check if the user is a member of the Teleghram group and doesn't have an allowed status
      } else if (chatMember && !statuses[chatMember.status]) {
        await this.removeCustomerFromGroup(customerGroupsMap, title, telegramUser);
      }
    }
    return customer;
  }
}

export default TelegramAuthService;
