
import { devLogger } from '../utils/dev-logger';
import { Channel } from './Channel';
import { Comment } from './Comment';
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
  private _anonymName: string;  // New property for anonymous name
  private _isOwner: boolean;    // New property for ownership
  private _media: { url: string; expiryDate: Date | null };
  private _visibility: string;

  private _channel: Channel;
  private _user: User;

  private _deletedAt: Date;
  private _createdAt: Date;

  private _eventDate: Date | null; // New field for event date
  private _eventLocation: string;  // New field for event location
  private _eventTime: string;      // New field for event time
  private _relationshipGoals: string[];   // Relationship goals like "casual", "long-term"
  private _ageRange: { min: number, max: number };  // Age range as min/max
  private _interests: string[];  // List of interests or hobbies
  private _hintAboutMe: string;  // Short hint about the user

  private safeDate(val: any): Date | null {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  constructor(){
    this._media = { url: '', expiryDate: null };
    this._eventDate = null;
    this._eventLocation = '';
    this._eventTime = '';
    this._relationshipGoals = [];
    this._ageRange = { min: 18, max: 100 }; // Default age range
    this._interests = [];
    this._hintAboutMe = '';
  }

  initialize(post: any){
    if (!post) return this;
    if (typeof post === 'string') {
      this.id = post;
      return this;
    }
    devLogger.log("Initializing Post:", post); // Log the entire comment object

    this.id = post._id;
    this.text = post.text;
    this.votes = post.votes
    this.voted = post.voted
    // Defensive: ensure comments is an array before mapping
    if (post.comments && Array.isArray(post.comments)) {
      this.comments = post.comments.map(comment => new Comment().initialize(comment));
    } else {
      this.comments = [];
    }
    this.anonyme = post.anonyme;
    this.backgroundColor = post.backgroundColor;
    this.color = post.color;
    this.anonymName = post.anonymName; // Initialize anonymName
    this.isOwner = post.isOwner;       // Initialize ownership
    this.visibility = post.visibility || 'public';
    this.media = post.media ? {
      url: post.media.url || '',
      expiryDate: this.safeDate(post.media.expiryDate)
    } : { url: '', expiryDate: null };

    this.deletedAt = this.safeDate(post.deletedAt);
    this.createdAt = this.safeDate(post.createdAt) || new Date();
    this.eventDate = this.safeDate(post.eventDate);
    this.eventLocation = post.eventLocation || '';
    this.eventTime = post.eventTime || '';

    this.relationshipGoals = Array.isArray(post.relationshipGoals) ? post.relationshipGoals : (typeof post.relationshipGoals === 'string' ? [post.relationshipGoals] : []);
    this.ageRange = post.ageRange || { min: 18, max: 99 };
    this.interests = Array.isArray(post.interests) ? post.interests : (typeof post.interests === 'string' ? post.interests.split(',').map(i => i.trim()) : []);
    this.hintAboutMe = post.hintAboutMe || '';

    this.channel = post.channel ? new Channel().initialize(post.channel) : null;
    this.user = post.user ? new User().initialize(post.user) : null;
    
    // Log warning if post has no user data (unless it's anonymous)
    if (!this.user && !post.anonyme) {
      devLogger.warn('Post missing user data:', {
        postId: this._id,
        text: this._text?.substring(0, 50),
        hasUser: !!post.user,
        userValue: post.user
      });
    }
    
    devLogger.log("Initialized post Object:", this); // Log the initialized object

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
  get anonymName(): string{ return this._anonymName } // Getter for anonymName
  get isOwner(): boolean { return this._isOwner; }
  get visibility(): string{ return this._visibility }
  get media(): { url: string; expiryDate: Date | null } {
    return this._media;
  }
  get channel(): Channel{ return this._channel }
  get user(): User{ return this._user }
  get eventDate(): Date | null { return this._eventDate; }
  get eventLocation(): string { return this._eventLocation; }
  get eventTime(): string { return this._eventTime; }
  get createdAt(): Date{ return this._createdAt }
  get deletedAt(): Date{ return this._deletedAt }

  get relationshipGoals(): string[] { return this._relationshipGoals; }
  get ageRange(): { min: number, max: number } { return this._ageRange; }
  get interests(): string[] { return this._interests; }
  get hintAboutMe(): string { return this._hintAboutMe; }



  set media(media: { url: string; expiryDate: Date | null }) {
    this._media = media;
  }
  set id(id: string){ this._id = id }
  set text(text: string){ this._text = text }
  set votes(votes: number){ this._votes = votes }
  set voted(voted: number){ this._voted = voted }
  set comments(comments: any[]){ this._comments = comments }
  set anonyme(anonyme: boolean){ this._anonyme = anonyme }
  set backgroundColor(backgroundColor: string){ this._backgroundColor = backgroundColor }
  set color(color: string){ this._color = color }
  set anonymName(anonymName: string){ this._anonymName = anonymName } // Setter for anonymName
  set isOwner(isOwner: boolean) { this._isOwner = isOwner; }
  set visibility(visibility: string){ this._visibility = visibility }


  set relationshipGoals(relationshipGoals: string[]) { this._relationshipGoals = relationshipGoals; }
  set ageRange(ageRange: { min: number, max: number }) { this._ageRange = ageRange; }
  set interests(interests: string[]) { this._interests = interests; }
  set hintAboutMe(hintAboutMe: string) { this._hintAboutMe = hintAboutMe; }
  
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
  set eventDate(eventDate: Date | null) { this._eventDate = eventDate; }
  set eventLocation(eventLocation: string) { this._eventLocation = eventLocation; }
  set eventTime(eventTime: string) { this._eventTime = eventTime; }
  set createdAt(createdAt: Date){ this._createdAt = createdAt }
  set deletedAt(deletedAt: Date){ this._deletedAt = deletedAt }
}
