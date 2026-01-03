const mongoose = require('mongoose');

function generateAnonymName(userId, postId) {
    return "Anonym_" + userId;
}

function withVotesInfo(entity, userId, postId) {
    const userVote = entity.votes.find(vote => vote.user == userId);

    let anonymName = entity.anonymName;

    const authorId = entity.user?._id || entity.user;
    const isOwner = authorId && userId && authorId.toString() === userId.toString();

    if (entity.anonyme && !anonymName) {
        anonymName = generateAnonymName(authorId, postId);
    }

    const result = {
        ...(typeof entity.toObject === 'function' ? entity.toObject() : entity),
        voted: !userVote ? 0 : userVote.vote,
        votes: entity.votes.length
            ? entity.votes.map(vote => vote.vote).reduce((acc, curr) => acc + curr)
            : 0,
        anonymName,
    };

    if (entity.anonyme && !isOwner) {
        delete result.user;
    }

    if (result.comments && Array.isArray(result.comments)) {
        result.comments = result.comments.map(comment => {
            const commentAuthorId = comment.user?._id || comment.user;
            const isCommentOwner = commentAuthorId && userId && commentAuthorId.toString() === userId.toString();

            if (comment.anonyme && !isCommentOwner) {
                const commentObj = (typeof comment.toObject === 'function' ? comment.toObject() : comment);
                delete commentObj.user;
                
                if (!commentObj.anonymName && commentAuthorId) {
                    commentObj.anonymName = generateAnonymName(commentAuthorId, postId);
                }
                return commentObj;
            }
            return comment;
        });
    }

    return result;
}

// Test cases
const myId = "659567890123456789012345";
const otherId = "659567890123456789012346";

const post = {
    _id: "post123",
    user: { _id: myId, firstName: "Me" },
    anonyme: true,
    votes: [],
    toObject: function() { return { _id: this._id, user: this.user, anonyme: this.anonyme, votes: this.votes }; }
};

console.log("Test 1: My anonymous post (should have user)");
const res1 = withVotesInfo(post, myId, post._id);
console.log("Has user:", !!res1.user);

console.log("\nTest 2: Other's anonymous post (should NOT have user)");
const res2 = withVotesInfo(post, otherId, post._id);
console.log("Has user:", !!res2.user);

const postWithComment = {
    _id: "post123",
    user: { _id: otherId, firstName: "Other" },
    anonyme: true,
    votes: [],
    comments: [
        {
            _id: "comm1",
            user: { _id: myId, firstName: "Me" },
            anonyme: true,
            toObject: function() { return { _id: this._id, user: this.user, anonyme: this.anonyme }; }
        },
        {
            _id: "comm2",
            user: { _id: otherId, firstName: "Other" },
            anonyme: true,
            toObject: function() { return { _id: this._id, user: this.user, anonyme: this.anonyme }; }
        }
    ],
    toObject: function() { return { _id: this._id, user: this.user, anonyme: this.anonyme, votes: this.votes, comments: this.comments }; }
};

console.log("\nTest 3: Post with comments");
const res3 = withVotesInfo(postWithComment, myId, postWithComment._id);
console.log("Post has user (other's):", !!res3.user);
console.log("Comment 1 has user (mine):", !!res3.comments[0].user);
console.log("Comment 2 has user (other's):", !!res3.comments[1].user);
