import { User } from './User';

export class Request {
  public _id: string;
  private _createdAt: Date;
  private _from: User;
  private _to: User;

  constructor(request?: any) {
    if (request) {
      this.initialize(request);
    }
  }

  initialize(request: any): Request {
    this.id = request._id; // Ensure to map _id correctly
    this.from = request.from;
    this.to = request.to;
    this.createdAt = new Date(request.createdAt);
    return this; // Return the current instance after initialization
  }

  get id(): string { return this._id; }
  get from(): User { return this._from; }
  get to(): User { return this._to; }
  get createdAt(): Date { return this._createdAt; }

  set id(id: string) { this._id = id; }
  set from(from: User | string) {
    if (from) {
      if (typeof from === 'string') {
        this._from = new User();
        this._from.id = from;
      } else {
        this._from = from; // Assuming from is already a User object
      }
    }
  }

  set to(to: User | string) {
    if (to) {
      if (typeof to === 'string') {
        this._to = new User();
        this._to.id = to;
      } else {
        this._to = to; // Assuming to is already a User object
      }
    }
  }

  set createdAt(createdAt: Date) { this._createdAt = createdAt; }
}
