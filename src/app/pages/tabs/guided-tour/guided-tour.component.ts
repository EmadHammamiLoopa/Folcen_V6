import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { GuidedTourService, GuidedTourState, GuidedTourStep } from 'src/app/services/guided-tour.service';

@Component({
  selector: 'app-guided-tour',
  templateUrl: './guided-tour.component.html',
  styleUrls: ['./guided-tour.component.scss']
})
export class GuidedTourComponent implements OnInit, OnDestroy {
  state: GuidedTourState;
  private sub: Subscription;

  constructor(
    public tour: GuidedTourService
  ) {}

  ngOnInit() {
    this.sub = this.tour.state$.subscribe(state => {
      this.state = state;
    });
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  get active(): boolean {
    return !!this.state?.active;
  }

  get step(): GuidedTourStep | null {
    return this.state?.steps?.[this.state.index] || null;
  }

  get progress(): number {
    if (!this.state?.steps?.length) return 0;
    return ((this.state.index + 1) / this.state.steps.length) * 100;
  }

  get stepLabel(): string {
    if (!this.step) return 'Guide';
    if (this.step.id === 'welcome') return 'Your first lap';
    if (this.step.id.includes('tag') || this.step.id.includes('comment') || this.step.id.includes('reaction')) return 'Join the moment';
    if (this.step.id.includes('privacy') || this.step.id.includes('anonymous')) return 'Your control';
    if (this.step.id.includes('chat') || this.step.id.includes('call')) return 'Stay close';
    if (this.step.id.includes('channel') || this.step.id.includes('post')) return 'Create and explore';
    if (this.step.id.includes('profile') || this.step.id.includes('avatar')) return 'Your identity';
    if (this.step.id.includes('feed') || this.step.id.includes('notification')) return 'Stay in the loop';
    return 'Start here';
  }

  get visualClass(): string {
    const id = this.step?.id || 'default';
    if (id.includes('privacy') || id.includes('anonymous')) return 'privacy';
    if (id.includes('chat') || id.includes('call')) return 'connect';
    if (id.includes('channel') || id.includes('post') || id.includes('feed') || id.includes('comment') || id.includes('reaction') || id.includes('tag')) return 'create';
    if (id.includes('profile') || id.includes('avatar')) return 'identity';
    if (id.includes('notification')) return 'notify';
    return 'discover';
  }

  get chips(): string[] {
    const id = this.step?.id || '';
    if (id.includes('avatar')) return ['Avatar', 'Photos', 'Style'];
    if (id.includes('tag')) return ['Mention', 'Friends', 'Respect'];
    if (id.includes('comment') || id.includes('reaction')) return ['Vote', 'React', 'Reply'];
    if (id.includes('media')) return ['Photo', 'Camera', '24 hours'];
    if (id.includes('search')) return ['People', 'Posts', 'Channels'];
    if (id.includes('privacy')) return ['Public', 'Friends', 'Only me'];
    if (id.includes('anonymous')) return ['Anonymous posts', 'Safer comments'];
    if (id.includes('channel')) return ['Explore', 'Follow', 'Create'];
    if (id.includes('post')) return ['Audience', 'Anonymity', 'Publish'];
    if (id.includes('chat')) return ['Messages', 'Status', 'Friends'];
    if (id.includes('call')) return ['Video', 'Audio', 'Friends'];
    if (id.includes('theme')) return ['Light', 'Dark'];
    return ['Discover', 'Connect', 'Share'];
  }

  get details(): string[] {
    const id = this.step?.id || '';
    if (id === 'welcome') return ['Your profile', 'Your circle', 'Your first post'];
    if (id.includes('search')) return ['Find people', 'Find channels', 'Open posts'];
    if (id.includes('discover')) return ['Search nearby people', 'Open profiles safely', 'Send requests when it feels right'];
    if (id === 'profile') return ['Photos and bio', 'Friend status', 'Profile privacy'];
    if (id.includes('avatar')) return ['Upload a real photo', 'Design a custom avatar', 'Keep a fallback style'];
    if (id.includes('friends')) return ['Review requests', 'See your friends', 'Unfriend when needed'];
    if (id.includes('chat')) return ['Real-time messages', 'Delivery status', 'Media and replies'];
    if (id.includes('call')) return ['Friends can call directly', 'Requests protect non-friends', 'Missed calls stay visible'];
    if (id.includes('media')) return ['Gallery', 'Camera', 'Temporary media'];
    if (id.includes('explore')) return ['City channels', 'Global spaces', 'Follow what fits'];
    if (id.includes('follow-channel')) return ['Follow to add it to your feed', 'Unfollow anytime', 'Explore keeps it discoverable'];
    if (id.includes('create-channel')) return ['Choose a topic', 'Add a clear image', 'Invite a community'];
    if (id.includes('post-privacy')) return ['Public', 'Friends only', 'Only me'];
    if (id.includes('anonymous')) return ['Anonymous posts', 'Anonymous comments', 'Mentions stay controlled'];
    if (id.includes('tag')) return ['Tag friends only', 'No self-tags', 'Anonymous stays private'];
    if (id.includes('comment') || id.includes('reaction')) return ['Vote without clutter', 'React quickly', 'Open full discussion'];
    if (id.includes('posts')) return ['Create updates', 'React and vote', 'Open full discussions'];
    if (id.includes('feed')) return ['Friends first', 'Followed channels', 'Important activity'];
    if (id.includes('notification')) return ['Messages', 'Requests', 'Mentions and calls'];
    if (id.includes('privacy')) return ['Hide age', 'Video requests', 'Blocked users'];
    if (id.includes('theme')) return ['Light mode', 'Dark mode', 'Comfort everywhere'];
    if (id.includes('settings')) return ['Replay guide', 'Account controls', 'Privacy shortcuts'];
    if (id.includes('marketplace')) return ['Listings', 'Photos', 'Safe contact'];
    if (id.includes('business')) return ['Jobs', 'Services', 'Local discovery'];
    return ['Know where to go', 'Try one action', 'Come back anytime'];
  }

  get demoTitle(): string {
    const id = this.step?.id || '';
    if (id.includes('avatar')) return 'Style studio';
    if (id.includes('search')) return 'Find anything';
    if (id.includes('tag')) return 'Mention flow';
    if (id.includes('comment')) return 'Discussion layer';
    if (id.includes('reaction')) return 'Quick reactions';
    if (id.includes('media')) return 'Media moment';
    if (id.includes('privacy')) return 'Control panel';
    if (id.includes('anonymous')) return 'Anonymous mode';
    if (id.includes('chat')) return 'Live thread';
    if (id.includes('call')) return 'Call-ready';
    if (id.includes('channel')) return 'Channel path';
    if (id.includes('post')) return 'Post draft';
    if (id.includes('feed')) return 'Smart feed';
    if (id.includes('notification')) return 'Priority alerts';
    if (id.includes('friend')) return 'Circle view';
    if (id.includes('profile')) return 'Profile card';
    return 'Quick preview';
  }

  get demoRows(): string[] {
    const id = this.step?.id || '';
    if (id.includes('avatar')) return ['Photo', 'Avatar', 'Color'];
    if (id.includes('search')) return ['People', 'Channels', 'Posts'];
    if (id.includes('tag')) return ['Friend tag', 'No self-tag', 'Private safe'];
    if (id.includes('comment')) return ['Read', 'Reply', 'Vote'];
    if (id.includes('reaction')) return ['Emoji', 'Vote', 'Open'];
    if (id.includes('media')) return ['Camera', 'Gallery', 'Expires'];
    if (id.includes('privacy')) return ['Public', 'Friends', 'Only me'];
    if (id.includes('anonymous')) return ['Name hidden', 'Tags guarded', 'Still social'];
    if (id.includes('chat')) return ['Sent', 'Delivered', 'Read'];
    if (id.includes('call')) return ['Request', 'Ring', 'Join'];
    if (id.includes('channel')) return ['Explore', 'Follow', 'Post'];
    if (id.includes('feed')) return ['Friends', 'Channels', 'Mentions'];
    if (id.includes('notification')) return ['Message', 'Request', 'Call'];
    return this.details.slice(0, 3);
  }

  get primaryText(): string {
    const index = this.state?.index || 0;
    const total = this.state?.steps?.length || 0;
    return index + 1 === total ? 'Finish guide' : 'Next';
  }

  next() {
    this.tour.next();
  }

  back() {
    this.tour.back();
  }

  skip() {
    this.tour.skip();
  }
}
