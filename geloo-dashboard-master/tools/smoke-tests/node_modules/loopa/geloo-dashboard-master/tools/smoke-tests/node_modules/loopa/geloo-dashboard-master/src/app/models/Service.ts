import { File } from './File';
export class Service{

  private _id: string;
  private _title: string;
  private _description: string;
  private _company: string;
  private _phone: string;
  private _location: string;
  private _state: string;
  private _photo: File;
  private _createdAt: Date;
  private _user: string

  constructor(product: Service){
    this.id = product._id;
    this.title = product.title;
    this.description = product.description;
    this.company = product.company;
    this.phone = product.phone;
    this.location = product.location;
    this.state = product.state;
    this.photo = product.photo;
    this.user = product.user;
    this.createdAt = new Date(product.createdAt)
  }

  get id(): string{ return this._id }
  get title(): string{ return this._title }
  get description(): string{ return this._description }
  get company(): string{ return this._company }
  get phone(): string{ return this._phone }
  get location(): string{ return this._location }
  get state(): string{ return this._state }
  get user(): string{ return this._user }
  get photo(): File{ return this._photo }
  get createdAt(): Date{ return this._createdAt }

  set id(id: string){ this._id = id }
  set title(title: string){ this._title = title }
  set description(description: string){ this._description = description }
  set company(company: string){ this._company = company }
  set phone(phone: string){ this._phone = phone }
  set location(location: string){ this._location = location }
  set state(state: string){ this._state = state }
  set user(user: string){ this._user = user }
  set photo(photo: File){ this._photo = photo }
  set createdAt(createdAt: Date){ this._createdAt = createdAt }
}
