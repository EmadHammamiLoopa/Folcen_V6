import { User } from './User';
export class Request{

  private _id: string;
  private _createdAt: Date;
  private _from: User
  private _to: User

  constructor(request: Request){
    this.id = request._id;
    this.from = request.from;
    this.to = request.to;
    this.createdAt = new Date(request.createdAt)
  }

  get id(): string{ return this._id }
  get from(): User{ return this._from }
  get to(): User{ return this._to }
  get createdAt(): Date{ return this._createdAt }

  set id(id: string){ this._id = id }
  set from(from: User){
    if(from){
      if(typeof from == 'string'){
        this._from = new User();
        this._from.id = from;
      }else{
        this._from = new User().initialize(from)
      }
    }
  }
  set to(to: User){
    if(to){
      if(typeof to == 'string'){
        this._to = new User();
        this._to.id = to;
      }else{
        this._to = new User().initialize(to)
      }
    }
  }
  set createdAt(createdAt: Date){ this._createdAt = createdAt }


  toObject(){
    return {
      _id: this.id,
      createdAt: this.createdAt,
      from: this.from.toObject(),
      to: this.to.toObject()
    }
  }
}
