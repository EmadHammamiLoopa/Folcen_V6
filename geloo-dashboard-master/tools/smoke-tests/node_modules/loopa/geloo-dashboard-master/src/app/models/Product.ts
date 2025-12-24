import { File } from './File';
export class Product{

  private _id: string;
  private _label: string;
  private _description: string;
  private _price: string;
  private _deletedAt: boolean;
  private _photo: File;
  private _createdAt: Date;
  private _user: string

  constructor(product: Product){
    console.log(product);

    this.id = product._id;
    this.label = product.label;
    this.description = product.description;
    this.price = product.price;
    this.deletedAt = product.deletedAt;
    this.photo = product.photo;
    this.user = product.user;
    this.createdAt = new Date(product.createdAt)
  }

  get id(): string{ return this._id }
  get label(): string{ return this._label }
  get description(): string{ return this._description }
  get price(): string{ return this._price }
  get deletedAt(): boolean{ return this._deletedAt }
  get user(): string{ return this._user }
  get photo(): File{ return this._photo }
  get createdAt(): Date{ return this._createdAt }

  set id(id: string){ this._id = id }
  set label(label: string){ this._label = label }
  set description(description: string){ this._description = description }
  set price(price: string){ this._price = price }
  set deletedAt(deletedAt: boolean){ this._deletedAt = deletedAt }
  set user(user: string){ this._user = user }
  set photo(photo: File){ this._photo = photo }
  set createdAt(createdAt: Date){ this._createdAt = createdAt }
}
