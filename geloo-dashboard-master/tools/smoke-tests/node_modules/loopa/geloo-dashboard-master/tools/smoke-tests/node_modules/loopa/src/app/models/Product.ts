// src/app/models/Product.ts
import constants from '../helpers/constants';
import { User } from './User';

export class Product {
  private _id: string;
  private _label: string;
  private _description: string;
  private _price: number;
  private _currency: string;
  private _country: string;
  private _city: string;
  private _enabled: boolean;
  private _sold: boolean;
  private _photos: { path: string; type: string; url?: string }[];
  private _createdAt: Date;
  private _user: User | string;
  private _category: string;
  private _stock: number;
  private _brand: string;
  private _condition: string;
  private _weight: string;
  private _dimensions: { length: string, width: string, height: string };
  private _tags: string[];

  constructor(product?: any) {
    if (product) {
      this.initialize(product);
    }
  }

  initialize(product: any): Product {
    this._id = product._id || '';
    this._label = product.label || '';
    this._description = product.description || '';
    this._price = product.price || 0;
    this._currency = product.currency || '';
    this._country = product.country || '';
    this._city = product.city || '';
    this._enabled = product.enabled ?? false;
    this._sold = product.sold ?? false;
    this._photos = (product.photos || []).map(photo => ({
      path: photo.path,
      type: photo.type,
      url: constants.DOMAIN_URL + photo.path
    }));
    this._user = product.user || '';
    this._category = product.category || '';
    this._stock = product.stock || 0;
    this._brand = product.brand || '';
    this._condition = product.condition || '';
    this._weight = product.weight || '';
    this._dimensions = product.dimensions || { length: '', width: '', height: '' };
    this._tags = product.tags || [];
    this._createdAt = new Date(product.createdAt) || new Date();

    // Log each field for debugging
    console.log('Product initialized with:');
    console.log('ID:', this._id);
    console.log('Label:', this._label);
    console.log('Description:', this._description);
    console.log('Price:', this._price);
    console.log('Currency:', this._currency);
    console.log('Country:', this._country);
    console.log('City:', this._city);
    console.log('Enabled:', this._enabled);
    console.log('Sold:', this._sold);
    console.log('Photos:', this._photos);
    console.log('User:', this._user);
    console.log('Category:', this._category);
    console.log('Stock:', this._stock);
    console.log('Brand:', this._brand);
    console.log('Condition:', this._condition);
    console.log('Weight:', this._weight);
    console.log('Dimensions:', this._dimensions);
    console.log('Tags:', this._tags);
    console.log('Created At:', this._createdAt);

    return this;
  }

  get id(): string { return this._id; }
  get label(): string { return this._label; }
  get description(): string { return this._description; }
  get price(): number { return this._price; }
  get currency(): string { return this._currency; }
  get country(): string { return this._country; }
  get city(): string { return this._city; }
  get enabled(): boolean { return this._enabled; }
  get sold(): boolean { return this._sold; }
  get user(): User | string { return this._user; }
  get photos(): { path: string; type: string; url?: string }[] {
    return this._photos;
  }
    get createdAt(): Date { return this._createdAt; }
  get category(): string { return this._category; }
  get stock(): number { return this._stock; }
  get brand(): string { return this._brand; }
  get condition(): string { return this._condition; }
  get weight(): string { return this._weight; }
  get dimensions(): { length: string, width: string, height: string } { return this._dimensions; }
  get tags(): string[] { return this._tags; }

  set id(id: string) { this._id = id; }
  set label(label: string) { this._label = label; }
  set description(description: string) { this._description = description; }
  set category(category: string) { this._category = category; }
  set price(price: number) { this._price = price; }
  set currency(currency: string) { this._currency = currency; }
  set country(country: string) { this._country = country; }
  set city(city: string) { this._city = city; }
  set enabled(enabled: boolean) { this._enabled = enabled; }
  set sold(sold: boolean) { this._sold = sold; }
  set user(user: User | string) { this._user = user; }
  set photos(photos: { path: string; type: string }[]) { this._photos = photos; }
  set createdAt(createdAt: Date) { this._createdAt = createdAt; }
  set stock(stock: number) { this._stock = stock; }
  set brand(brand: string) { this._brand = brand; }
  set condition(condition: string) { this._condition = condition; }
  set weight(weight: string) { this._weight = weight; }
  set dimensions(dimensions: { length: string, width: string, height: string }) { this._dimensions = dimensions; }
  set tags(tags: string[]) { this._tags = tags; }
}
