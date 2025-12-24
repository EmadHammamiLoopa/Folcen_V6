import { User } from 'src/app/models/User';
import { File } from './File';
export class Channel{

  private _id: string;
  private _name: string;
  private _description: string;
  private _pin: boolean;
  private _activated: boolean;
  private _photo: File;
  private _createdAt: Date;
  private _user: User;

  private _followed: boolean;
  private _followerSize: number;

  constructor(){
  }

  initialize(channel: Channel){
    this.id = channel._id;
    this.name = channel.name;
    this.description = channel.description;
    this.activated = channel.activated;
    this.photo = channel.photo;
    this.pin = channel.pin;

    this.user = channel.user;

    this.createdAt = new Date(channel.createdAt);

    this.followerSize = channel.followerSize;
    this.followed = channel.followed as boolean;

    return this;
  }

  get id(): string{ return this._id }
  get name(): string{ return this._name }
  get description(): string{ return this._description }
  get pin(): boolean{ return this._pin }
  get activated(): boolean{ return this._activated }
  get user(): User{ return this._user }
  get photo(): File{ return this._photo }
  get createdAt(): Date{ return this._createdAt }

  get followed(): boolean{ return this._followed }
  get followerSize(): number{ return this._followerSize }

  set id(id: string){ this._id = id }
  set name(name: string){ this._name = name }
  set description(description: string){ this._description = description }
  set pin(pin: boolean){ this._pin = pin }
  set activated(activated: boolean){ this._activated = activated }

  set user(user: User){
    if(user){
      if(typeof user == 'string'){
        this._user = new User();
        this._user.id = user;
      }else{
        this._user = new User().initialize(user)
      }
    }
  }

  set photo(photo: File){ this._photo = photo }
  set createdAt(createdAt: Date){ this._createdAt = createdAt }

  set followerSize(followerSize: number){ this._followerSize = followerSize ? followerSize : 0 }
  set followed(followed: boolean){ this._followed = followed }
}
