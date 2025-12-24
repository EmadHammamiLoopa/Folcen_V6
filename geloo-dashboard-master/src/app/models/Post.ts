import { Channel } from './Channel';
import { Comment } from './Commentt';
import { User } from './User';
export class Post{

  private _id: string;
  private _text: string;
  private _votes: number;
  private _voted: number;
  private _comments: Comment[];
  private _anonyme: boolean;
  private _backgroundColor: string;
  private _color: string;

  private _channel: Channel;
  private _user: User;

  private _deletedAt: Date;
  private _createdAt: Date;

  constructor(){
  }

  initialize(post: Post){
    this.id = post._id;
    this.text = post.text;
    this.votes = post.votes
    this.voted = post.voted
    this.comments = post.comments.map(comment => new Comment().initialize(comment));
    this.anonyme = post.anonyme;
    this.backgroundColor = post.backgroundColor;
    this.color = post.color;

    this.deletedAt = new Date(post.deletedAt);
    this.createdAt = new Date(post.createdAt);

    this.channel = post.channel;
    this.user = post.user;

    return this;
  }

  get id(): string{ return this._id }
  get text(): string{ return this._text }
  get votes(): number{ return this._votes }
  get voted(): number{ return this._voted }
  get comments(): any[]{ return this._comments }
  get anonyme(): boolean{ return this._anonyme }
  get backgroundColor(): string{ return this._backgroundColor }
  get color(): string{ return this._color }

  get channel(): Channel{ return this._channel }
  get user(): User{ return this._user }

  get createdAt(): Date{ return this._createdAt }
  get deletedAt(): Date{ return this._deletedAt }

  set id(id: string){ this._id = id }
  set text(text: string){ this._text = text }
  set votes(votes: number){ this._votes = votes }
  set voted(voted: number){ this._voted = voted }
  set comments(comments: any[]){ this._comments = comments }
  set anonyme(anonyme: boolean){ this._anonyme = anonyme }
  set backgroundColor(backgroundColor: string){ this._backgroundColor = backgroundColor }
  set color(color: string){ this._color = color }

  set channel(channel: Channel){
    if(channel){
      if(typeof channel == 'string'){
        this._channel = new Channel();
        this._channel.id = channel
      }else{
        this._channel = new Channel().initialize(channel);
      }
    }
  }
  set user(user: User){
    if(user){
      if(typeof user == 'string'){
        this._user = new User();
        this._user.id = user
      }else{
        this._user = new User().initialize(user);
      }
    }
  }

  set createdAt(createdAt: Date){ this._createdAt = createdAt }
  set deletedAt(deletedAt: Date){ this._deletedAt = deletedAt }
}
