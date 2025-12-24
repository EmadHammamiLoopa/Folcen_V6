import { File } from './File';
export class Job{

  private _id: string;
  private _title: string;
  private _description: string;
  private _company: string;
  private _email: string;
  private _location: string;
  private _enabled: boolean;
  private _photo: File;
  private _createdAt: Date;
  private _user: string

  constructor(job: Job){
    this.id = job._id;
    this.title = job.title;
    this.description = job.description;
    this.company = job.company;
    this.email = job.email;
    this.location = job.location;
    this.enabled = job.enabled;
    this.photo = job.photo;
    this.user = job.user;
    this.createdAt = new Date(job.createdAt)
  }

  get id(): string{ return this._id }
  get title(): string{ return this._title }
  get description(): string{ return this._description }
  get company(): string{ return this._company }
  get email(): string{ return this._email }
  get location(): string{ return this._location }
  get enabled(): boolean{ return this._enabled }
  get user(): string{ return this._user }
  get photo(): File{ return this._photo }
  get createdAt(): Date{ return this._createdAt }

  set id(id: string){ this._id = id }
  set title(title: string){ this._title = title }
  set description(description: string){ this._description = description }
  set company(company: string){ this._company = company }
  set email(email: string){ this._email = email }
  set location(location: string){ this._location = location }
  set enabled(enabled: boolean){ this._enabled = enabled }
  set user(user: string){ this._user = user }
  set photo(photo: File){ this._photo = photo }
  set createdAt(createdAt: Date){ this._createdAt = createdAt }
}
