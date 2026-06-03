module.exports = {
    sendResponse: (res, data = null, message = null, additionalInfo = {}) => {
        // Convert Mongoose documents (and nested docs) to plain objects
        function sanitize(value) {
            if (value == null) return value;

            // Convert ObjectId-like objects to string early
            try {
                if (value && typeof value === 'object' && (
                    value._bsontype === 'ObjectID' || 
                    value._bsontype === 'ObjectId' ||
                    (value.constructor && (value.constructor.name === 'ObjectID' || value.constructor.name === 'ObjectId')) ||
                    (typeof value.toHexString === 'function')
                )) {
                    return String(value);
                }
            } catch (e) {}

            // Arrays: sanitize each element
            if (Array.isArray(value)) return value.map(sanitize);
            // If it's a Mongoose document with toObject()
            try {
                if (typeof value.toObject === 'function') {
                    const obj = value.toObject({ virtuals: true });
                    return sanitize(obj);
                }
            } catch (e) {}
            // If it has _doc (lean-ish), use it
            if (value && typeof value === 'object' && value._doc) {
                return sanitize(value._doc);
            }
            // Plain object: sanitize each field
            if (value && typeof value === 'object') {
                // Convert Date objects to ISO strings for safe JSON transport
                if (value instanceof Date) return value.toISOString();
                const out = Array.isArray(value) ? [] : {};
                for (const k of Object.keys(value)) {
                    out[k] = sanitize(value[k]);
                }
                return out;
            }
            // primitive
            return value;
        }

        try {
            if (process.env.DEBUG_AUTH_RESPONSE === '1' && data && (data.token || (data.user && data.user._id))) {
                console.log('DEBUG Response.sendResponse: sending data keys', Object.keys(data));
                if (data.token) console.log('DEBUG Response.sendResponse: token present (len)', String(data.token).length);
            }
        } catch (e) { }

        const safeData = sanitize(data);
        return res.json({
            success: true,
            data: safeData,
            message,
            ...additionalInfo // Allow passing additional metadata if necessary
        });
    },

    sendError: (res, status, errors = null, errorCode = null) => {
        return res.status(status).json({
            success: false,
            message: typeof errors === 'string' ? errors : null,
            errors,
            errorCode // Optionally include an error code for better debugging
        });
    }
};
