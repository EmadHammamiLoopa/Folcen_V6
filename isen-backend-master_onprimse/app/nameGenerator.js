const Response = require("./controllers/Response");
const Report = require("./models/Report");

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

function generateAnonymName(userId, postId) {
    // Combine userId and postId to create a unique hash seed
    const combinedId = userId + '_' + postId;
    const hash = simpleHash(combinedId).toString();

    // Engaging adjectives (social-friendly & unique)
    const adjectives = [
        "Radiant", "Enigmatic", "Mystic", "Ethereal", "Celestial", "Luminous", "Velvet", "Golden",
        "Crimson", "Azure", "Emerald", "Sapphire", "Amber", "Opalescent", "Gilded", "Silken",
        "Whispering", "Dancing", "Flickering", "Blazing", "Serene", "Majestic", "Harmonic", "Vivid",
        "Timeless", "Eclipsed", "Starlit", "Moonlit", "Sunlit", "Twilight", "Dreamlike", "Enchanted",
        "Nebulous", "Shadowy", "Illustrious", "Arcane", "Runic", "Magnetic", "Mirrored", "Shimmering",
        "Thunderous", "Galactic", "Hypernova", "Eclipse", "Starbound", "Borealis", "Lunar", "Solar"
    ];

    // Unique and engaging creatures (fantasy & modern mix)
    const animals = [
        "Phoenix", "Griffin", "Unicorn", "Dragon", "Pegasus", "Kraken", "Sphinx", "Chimera",
        "Mermaid", "Basilisk", "Centaur", "Hydra", "Yeti", "Leviathan", "Cerberus", "Fenrir",
        "Valkyrie", "Nymph", "Satyr", "Kitsune", "Garuda", "Roc", "Simurgh", "Quetzalcoatl",
        "Tengu", "Selkie", "Kelpie", "Banshee", "Djinn", "Ifrit", "Zephyr", "Aether",
        "Astronaut", "Cyberwolf", "Starfox", "Moonwalker", "NeonPanther", "VoidTiger", "SolarFalcon",
        "StormBear", "Galaxion", "NeonSphinx", "ShadowWraith", "LavaGolem", "ThunderWolf", "FrostDrake"
    ];

    // Generate an extra layer of uniqueness (randomized number suffix)
    const suffixNumbers = Array.from({ length: 10 }, (_, i) => i + 1); // Numbers 1-10 for more variety

    // Ensure the hash is long enough by converting it to a fixed-length string
    const extendedHash = (hash + simpleHash(hash)).toString().padStart(10, '0'); // 🔹 Ensure it's always long enough

    // 🔹 Ensure valid numeric indexes
    const adjectiveIndex = Math.abs(parseInt(extendedHash.substring(0, 3), 10) || 0) % adjectives.length;
    const animalIndex = Math.abs(parseInt(extendedHash.substring(3, 6), 10) || 0) % animals.length;
    const suffixIndex = Math.abs(parseInt(extendedHash.substring(6, 8), 10) || 0) % suffixNumbers.length;

    // Select words from the arrays
    const randomAdjective = adjectives[adjectiveIndex] || "Mysterious"; // 🔹 Default to prevent "undefined"
    const randomAnimal = animals[animalIndex] || "Entity"; // 🔹 Default to prevent "undefined"
    const randomSuffix = suffixNumbers[suffixIndex];

    return `${randomAdjective}_${randomAnimal}${randomSuffix}`;
}

// Example hashing function
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}


function withVotesInfo(entity, userId, postId) {
    const userVote = entity.votes.find(vote => vote.user == userId);

    let anonymName = entity.anonymName; // Use the anonymName from the entity if it's already set

    const authorId = entity.user?._id || entity.user;
    const isOwner = authorId && userId && authorId.toString() === userId.toString();

    if (entity.anonyme && !anonymName) {
        anonymName = generateAnonymName(authorId, postId); // Generate based on the entity's user ID
        console.log("Generated anonymName for anonymous entity:", anonymName);
    }

    const result = {
        ...(typeof entity.toObject === 'function' ? entity.toObject() : entity),
        voted: !userVote ? 0 : userVote.vote,
        votes: entity.votes.length
            ? entity.votes.map(vote => vote.vote).reduce((acc, curr) => acc + curr)
            : 0,
        anonymName,  // Attach the anonymous name only if the post/comment is anonymous
        isOwner,     // 🛡️ Explicitly tell the frontend if the requester is the owner
    };

    // 🛡️ Privacy Guard: Strip user info if anonymous AND not the owner
    if (entity.anonyme && !isOwner) {
        delete result.user;
    }

    // 🛡️ Privacy Guard: Also check comments if this is a post
    if (result.comments && Array.isArray(result.comments)) {
        result.comments = result.comments.map(comment => {
            const commentAuthorId = comment.user?._id || comment.user;
            const isCommentOwner = commentAuthorId && userId && commentAuthorId.toString() === userId.toString();

            const commentObj = (typeof comment.toObject === 'function') ? comment.toObject() : { ...comment };
            commentObj.isOwner = !!isCommentOwner;

            if (comment.anonyme && !isCommentOwner) {
                delete commentObj.user;
                
                // Ensure anonymName is present for comments too
                if (!commentObj.anonymName && commentAuthorId) {
                    commentObj.anonymName = generateAnonymName(commentAuthorId, postId);
                }
            }
            return commentObj;
        });
    }

    return result;
}




module.exports = {
    generateAnonymName,
    withVotesInfo,
};
