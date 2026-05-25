const Validator = require('validatorjs');
const Response = require('../../controllers/Response');

// validatorjs has no built-in alpha_spaces rule — register it once here
Validator.register(
    'alpha_spaces',
    (value) => /^[\p{L}\s'-]+$/u.test(value),
    'The :attribute may only contain letters, spaces, hyphens, and apostrophes.'
);

exports.userStoreValidator = (req, res, next) => {
    try {
        // Formidable parses multipart fields into req.fields; fall back to req.body for JSON
        const data = req.fields || req.body;

        // Sanitize "undefined" / "null" strings sent by the frontend
        if (data) {
            Object.keys(data).forEach(key => {
                if (data[key] === 'undefined' || data[key] === 'null') {
                    delete data[key];
                }
            });
        }

        // Normalize birthDate (camelCase from frontend) → birthdate (validator key)
        if (data.birthDate && !data.birthdate) {
            const parsed = new Date(data.birthDate);
            if (!isNaN(parsed.getTime())) {
                data.birthdate = parsed.toISOString().split('T')[0];
            }
        }

        const validation = new Validator(data, {
            'firstName': 'required|alpha_spaces|max:40|min:2',
            'lastName': 'required|alpha_spaces|max:40|min:2',
            'email': 'required|email|max:150|min:5',
            'password': 'required|confirmed|max:150|min:8',
            'gender': 'required|in:male,female,other,prefer not to say',
            'phone': 'min:4',
            'country': 'alpha_spaces|max:30|min:3',
            'birthdate': 'date',
            'school': 'max:50',
            'education': 'max:30|min:2',
            'profession': 'max:30|min:2',
        });
        if (validation.fails()) return Response.sendError(res, 400, validation.errors);
        next();
    } catch (error) {
        console.log(error);
    }
};



exports.userDashUpdateValidator = (req, res, next) => {
    console.log('userDashUpdateValidator middleware called');

    try {
        const data = req.fields || req.body;
        
        // Sanitize "undefined" strings from frontend
        if (data) {
            Object.keys(data).forEach(key => {
                if (data[key] === 'undefined' || data[key] === 'null') {
                    delete data[key];
                }
            });
        }

        const validation = new Validator(data, {
            'firstName': 'alpha_spaces|max:40|min:2',
            'lastName': 'alpha_spaces|max:40|min:2',
            'email': 'email|max:150|min:5',
            'gender': 'in:male,female,other,prefer not to say',
            'phone': 'min:4',
            'country': 'alpha_spaces|max:30|min:3',
            'password': 'min:8|confirmed',
            'birthdate': 'date',
            'school': 'max:50',
            'education': 'max:30|min:2',
            'profession': 'max: 30|min:2',
        });
        if(validation.fails()) return Response.sendError(res, 400, validation.errors);
        next();
    } catch (error) {
        console.log(error);
    }
};

exports.userUpdateValidator = (req, res, next) => {
    // Normalize and coerce some incoming frontend values so Validator rules pass
    try {
        const data = req.body;
        if (data) {
            Object.keys(data).forEach(key => {
                if (data[key] === 'undefined' || data[key] === 'null') {
                    delete data[key];
                }
            });
        }

        if (req.body && req.body.birthDate && !req.body.birthdate) {
            const parsed = new Date(req.body.birthDate);
            if (!isNaN(parsed.getTime())) {
                const short = parsed.toISOString().split('T')[0];
                req.body.birthdate = short;
                req.body.birthDate = short;
            }
        }
        // If interests is a string, leave it as-is (validator will accept string or array)
        if (req.body && req.body.interests && typeof req.body.interests === 'string') {
            // normalize whitespace
            req.body.interests = req.body.interests.split(',').map(s => s.trim()).filter(Boolean).join(',');
        }
    } catch (e) {
        // normalization should never throw
    }

    const fieldsToValidate = {};

    // Helper: skip validating empty strings, empty arrays, or values unchanged from req.user
    const shouldValidate = (key) => {
        if (!req.body || typeof req.body === 'undefined') return false;
        const val = req.body[key];
        if (val === undefined || val === null) return false;
        if (Array.isArray(val) && val.length === 0) return false;
        if (typeof val === 'string') {
            if (val.trim() === '') return false; // empty string => likely unchanged or UI artifact
            // if authenticated user present and value equals existing, skip
            if (req.user && String(req.user[key] || '') === val) return false;
        } else {
            // non-string, non-array: if equals existing, skip
            if (req.user && typeof req.user[key] !== 'undefined' && req.user[key] === val) return false;
        }
        return true;
    };

    if (shouldValidate('firstName')) fieldsToValidate.firstName = 'alpha_spaces|max:40|min:2';
    if (shouldValidate('lastName')) fieldsToValidate.lastName = 'alpha_spaces|max:40|min:2';
    if (shouldValidate('email')) fieldsToValidate.email = 'email|max:150|min:5';
    if (shouldValidate('gender')) fieldsToValidate.gender = 'in:male,female,other';
    if (shouldValidate('phone')) fieldsToValidate.phone = 'regex:\+?[0-9]+|min:4';
    if (shouldValidate('country')) fieldsToValidate.country = 'alpha_spaces|max:30|min:3';
    // Accept both birthdate and birthDate (frontend uses birthDate)
    if (shouldValidate('birthdate') || shouldValidate('birthDate')) fieldsToValidate.birthdate = 'date';
    if (shouldValidate('school')) fieldsToValidate.school = 'max:50|min:2';
    if (shouldValidate('education')) fieldsToValidate.education = 'max:30|min:2';
    if (shouldValidate('profession')) fieldsToValidate.profession = 'max:30|min:2';
    if (shouldValidate('interests')) {
        // Allow both array and string, and increase limits to avoid validation quirks
        if (Array.isArray(req.body.interests)) fieldsToValidate.interests = 'array';
        else fieldsToValidate.interests = 'string|max:1000';
    }
    if (shouldValidate('languages')) {
        if (Array.isArray(req.body.languages)) fieldsToValidate.languages = 'array';
        else fieldsToValidate.languages = 'string|max:1000';
    }
    if (shouldValidate('aboutMe')) fieldsToValidate.aboutMe = 'max:500';
    if (shouldValidate('studyCountry')) fieldsToValidate.studyCountry = 'max:100';

    const validation = new Validator(req.body, fieldsToValidate);
    
    // DEBUG: log what we're validating and any errors to help frontend debugging
    try {
        console.log('userUpdateValidator: fieldsToValidate =', fieldsToValidate);
    } catch(e){}

    if(validation.fails()) {
        try { console.log('userUpdateValidator: errors =', validation.errors); } catch(e){}
        return Response.sendError(res, 400, validation.errors);
    }
    
    next();
};


exports.updatePasswordValidator = (req, res, next) => {
    const validation = new Validator(req.body, {
        'current_password': 'string|required',
        'password': 'min:8|max:40|confirmed|required',
    });
    if(validation.fails()) return Response.sendError(res, 400, validation.errors);
    next();
};

exports.updateEmailValidator = (req, res, next) => {
    console.log('Validating email for user:', req.body.email);

    try {
        const validation = new Validator(req.body, {
            'email': 'required|email|max:50',
            'current_password': 'required|string'
        });

        if (validation.fails()) {
            console.log('Email validation failed:', validation.errors.all());
            return Response.sendError(res, 400, validation.errors.all());
        }

        console.log('Email validation passed, calling next()');
        next();
    } catch (err) {
        console.error('Error in updateEmailValidator:', err);
        return Response.sendError(res, 500, 'Internal validation error');
    }
};

