export class Subscription {

  // Subscription-related properties
  private _id: string;
  private _offers: string[];
  private _dayPrice: number;
  private _weekPrice: number;
  private _monthPrice: number;
  private _yearPrice: number;
  private _currency: string;
  private _createdAt: Date;
  private _updatedAt: Date;

  // User-related properties
  private _userId: string;
  private _userFirstName: string;
  private _userLastName: string;

  constructor(subscription: Partial<Subscription>, user?: { id: string; firstName: string; lastName: string }) {
    // Initialize subscription fields
    this._id = subscription.id || '';
    this._offers = subscription.offers || [];
    this._dayPrice = subscription.dayPrice || 0;
    this._weekPrice = subscription.weekPrice || 0;
    this._monthPrice = subscription.monthPrice || 0;
    this._yearPrice = subscription.yearPrice || 0;
    this._currency = subscription.currency || 'USD';
    this._createdAt = subscription.createdAt ? new Date(subscription.createdAt) : new Date();
    this._updatedAt = subscription.updatedAt ? new Date(subscription.updatedAt) : new Date();

    // Initialize user-related fields if a user object is provided
    if (user) {
      this._userId = user.id;
      this._userFirstName = user.firstName;
      this._userLastName = user.lastName;
    } else {
      this._userId = '';
      this._userFirstName = '';
      this._userLastName = '';
    }
  }

  // Getters for subscription fields
  get id(): string { return this._id; }
  get offers(): string[] { return this._offers; }
  get dayPrice(): number { return this._dayPrice; }
  get weekPrice(): number { return this._weekPrice; }
  get monthPrice(): number { return this._monthPrice; }
  get yearPrice(): number { return this._yearPrice; }
  get currency(): string { return this._currency; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  // Getters for user-related fields
  get userId(): string { return this._userId; }
  get userFirstName(): string { return this._userFirstName; }
  get userLastName(): string { return this._userLastName; }

  // Setters for subscription fields
  set id(id: string) { this._id = id; }
  set offers(offers: string[]) { this._offers = offers; }
  set dayPrice(dayPrice: number) { this._dayPrice = dayPrice; }
  set weekPrice(weekPrice: number) { this._weekPrice = weekPrice; }
  set monthPrice(monthPrice: number) { this._monthPrice = monthPrice; }
  set yearPrice(yearPrice: number) { this._yearPrice = yearPrice; }
  set currency(currency: string) { this._currency = currency; }
  set createdAt(createdAt: Date) { this._createdAt = createdAt; }
  set updatedAt(updatedAt: Date) { this._updatedAt = updatedAt; }

  // Setters for user-related fields
  set userId(userId: string) { this._userId = userId; }
  set userFirstName(userFirstName: string) { this._userFirstName = userFirstName; }
  set userLastName(userLastName: string) { this._userLastName = userLastName; }

  // Method to display full user name
  get fullUserName(): string {
    return `${this._userFirstName} ${this._userLastName}`;
  }

  // Method to check if the subscription has any price set
  hasPricing(): boolean {
    return this._dayPrice > 0 || this._weekPrice > 0 || this._monthPrice > 0 || this._yearPrice > 0;
  }

  // Method to check if subscription is active based on created and updated timestamps
  isActive(): boolean {
    return this._createdAt <= new Date() && this._updatedAt > this._createdAt;
  }
}
