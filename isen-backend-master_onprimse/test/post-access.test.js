const mongoose = require('mongoose');
const { expect } = require('chai');

const Post = require('../app/models/Post');
const User = require('../app/models/User');
const PostController = require('../app/controllers/PostController');
const PostMiddleware = require('../app/middlewares/post');

function makeResponse() {
    let body = null;
    let statusCode = 200;

    return {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            body = payload;
            return payload;
        },
        get body() {
            return body;
        },
        get statusCode() {
            return statusCode;
        }
    };
}

function queryReturning(value) {
    return {
        populate() {
            return this;
        },
        exec() {
            return Promise.resolve(value);
        }
    };
}

function makePost(overrides = {}) {
    const post = {
        _id: new mongoose.Types.ObjectId(),
        text: 'Neighborhood update',
        user: {
            _id: new mongoose.Types.ObjectId(),
            enabled: true,
            isDeleted: false,
            banned: false,
            deletedAt: null,
            isPrivate: true
        },
        channel: { _id: new mongoose.Types.ObjectId(), name: 'Neighborhood Watch' },
        comments: [],
        reports: [],
        votes: [],
        visibility: 'public',
        moderationStatus: 'approved',
        deletedAt: null,
        anonyme: false,
        ...overrides
    };

    post.toObject = () => {
        const plain = { ...post };
        delete plain.toObject;
        return plain;
    };

    return post;
}

describe('Opened channel post access', () => {
    const originalPostFindOne = Post.findOne;
    const originalUserFindOne = User.findOne;

    afterEach(() => {
        Post.findOne = originalPostFindOne;
        User.findOne = originalUserFindOne;
    });

    async function openPost(post) {
        const viewerId = new mongoose.Types.ObjectId();
        Post.findOne = () => queryReturning(post);
        User.findOne = () => Promise.resolve(null);

        const req = {
            post: { _id: post._id },
            auth: { _id: viewerId },
            authUser: { _id: viewerId, friends: [], blockedUsers: [] }
        };
        const res = makeResponse();

        await PostController.showPost(req, res);
        return res;
    }

    it('opens a public channel post even when its author profile is private', async () => {
        const res = await openPost(makePost());

        expect(res.statusCode).to.equal(200);
        expect(res.body.success).to.equal(true);
        expect(res.body.data.text).to.equal('Neighborhood update');
    });

    it('still rejects a friends-only post for a non-friend', async () => {
        const res = await openPost(makePost({ visibility: 'friends-only' }));

        expect(res.statusCode).to.equal(403);
        expect(res.body.message).to.equal('This post is for friends only');
    });

    it('returns not found for a soft-deleted post opened from a stale link', async () => {
        const res = await openPost(makePost({ deletedAt: new Date() }));

        expect(res.statusCode).to.equal(404);
        expect(res.body.message).to.equal('Post not found');
    });

    it('returns not found when the author record no longer exists', async () => {
        const res = await openPost(makePost({ user: null }));

        expect(res.statusCode).to.equal(404);
        expect(res.body.message).to.equal('Post not found');
    });

    it('uses HTTP 404 when a stale post id no longer exists', async () => {
        const id = String(new mongoose.Types.ObjectId());
        Post.findOne = () => queryReturning(null);
        const req = {};
        const res = makeResponse();
        let nextCalled = false;

        await PostMiddleware.postById(req, res, () => {
            nextCalled = true;
        }, id);

        expect(nextCalled).to.equal(false);
        expect(res.statusCode).to.equal(404);
        expect(res.body.message).to.equal('Post not found');
    });
});
