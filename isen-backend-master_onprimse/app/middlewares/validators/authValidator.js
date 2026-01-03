const Validator = require('validatorjs')
const Response = require('../../controllers/Response')
const { check, validationResult } = require('express-validator');

exports.signupValidator = (req, res, next) => {
    console.log('DEBUG: signupValidator req.body', JSON.stringify(req.body, null, 2));
    const validation = new Validator(req.body, {
        'firstName': 'required|alpha_dash|max:50|min:2',
        'lastName': 'required|alpha_dash|max:50|min:2',
        'password': 'required|confirmed|min:8|max:50',
        'email': 'required|email|max:150|min:5',
        'gender': 'required|in:male,female,other,prefer not to say',
        'birthDate': 'required|date',
        'school': 'string|max:100', // Ensure it's a string and optional
        'education': 'string|max:100', // Ensure it's a string and optional
        'profession': 'string|max:100', // Ensure it's a string and optional
        'aboutMe': 'string|max:500' // Ensure it's a string and optional
    });
    const birthDate = new Date(req.body.birthDate).getTime();
    const currDate = new Date().getTime();
    const diffDate = currDate - birthDate;

    if(validation.fails()) {
        console.log('DEBUG: signupValidator fails', JSON.stringify(validation.errors.all(), null, 2));
        return Response.sendError(res, 400, validation.errors);
    }
    else if(diffDate < 8 * 365 * 24 * 60 * 60 * 1000) {
        return Response.sendError(res, 400, {
            errors: {
                birthDate: ['invalid birth date']
            }
        });
    }
    next();
}



exports.signinValidator = [
    // Check email validity
    check('email')
        .trim()  // Remove extra spaces
        .isEmail().withMessage('Invalid email format. Please provide a valid email address.')
        .not().isEmpty().withMessage('Email is required.')
        .normalizeEmail(),  // Normalize the email

    // Check password validity
    check('password')
        .trim()  // Remove extra spaces
        .not().isEmpty().withMessage('Password cannot be empty.')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),  // Password length check

    // General error handling
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: "Validation failed. Please check your input.",
                errors: errors.array().map(err => ({
                    field: err.param,
                    message: err.msg
                }))
            });
        }
        next();
    }
];



exports.checkEmailValidator = (req, res, next) => {
    const validation = new Validator(req.body, {
        'email': 'required|email'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}