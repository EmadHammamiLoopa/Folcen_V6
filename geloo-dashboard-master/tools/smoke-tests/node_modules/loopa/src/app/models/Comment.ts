import { Post } from './Post';
import { User } from './User';
export class Comment{

  private _id: string;
  private _text: string;
  private _anonyme: boolean;

  private _votes: number;
  private _voted: number;
  private _anonymName: string;  // New property for anonymous name
  private _media: { url: string; expiryDate: Date | null };

  private _post: Post;
  private _user: User;

  private _createdAt: Date;

  constructor(){

    this._media = { url: '', expiryDate: null };

  }

  initialize(comment: Comment){
    console.log("Initializing Comment:", comment); // Log the entire comment object

    this.id = comment._id;
    this.text = comment.text;
    this.anonyme = comment.anonyme; 
    this.votes = comment.votes;
    this.voted = comment.voted;
    this.anonymName = comment.anonymName; // Initialize anonymName

    this.createdAt = new Date(comment.createdAt);
    this.media = comment.media ? {
      url: comment.media.url || '',
      expiryDate: comment.media.expiryDate ? new Date(comment.media.expiryDate) : null
    } : { url: '', expiryDate: null };

    this.post = comment.post;
    this.user = comment.user;
    console.log("Initialized Comment Object:", this); // Log the initialized object

    return this;
  }

  get id(): string{ return this._id }
  get text(): string{ return this._text }
  get anonyme(): boolean {
    return this._anonyme;
  }
  
  get votes(): number{ return this._votes }
  get voted(): number{ return this._voted }
  get media(): { url: string; expiryDate: Date | null } {
    return this._media;
  }
  get post(): Post{ return this._post }
  get user(): User{ return this._user }
  get anonymName(): string{ return this._anonymName } // Getter for anonymName

  get createdAt(): Date{ return this._createdAt }

  set media(media: { url: string; expiryDate: Date | null }) {
    this._media = media;
  }
  set id(id: string){ this._id = id }
  set text(text: string){ this._text = text }
  set anonyme(anonyme: boolean) {
    this._anonyme = anonyme;
  }
  
  set votes(votes: number){ this._votes = votes }
  set voted(voted: number){ this._voted = voted }
  set anonymName(anonymName: string){ this._anonymName = anonymName } // Setter for anonymName

  set post(post: Post){
    if(post){
      if(typeof post == 'string'){
        this._post = new Post();
        this._post.id = post
      }else{
        this._post = new Post().initialize(post);
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
}
