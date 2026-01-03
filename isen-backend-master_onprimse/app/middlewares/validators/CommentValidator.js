const Response = require("../../controllers/Response");
const Validator = require('validatorjs');

exports.storeCommentValidator = (req, res, next) => {
    // Log to check if 'text' exists in req.body
    console.log("Validating req.body:", req.body);

    const validation = new Validator(req.body, {
        'text': 'min:1|max:255|required' // Ensure the text is at least 1 character and required
    });

    if (validation.fails()) {
        console.log("Validation failed with errors:", validation.errors.all());
        return Response.sendError(res, 400, {
            message: "Validation failed",
            errors: validation.errors.all() // Provide a detailed list of validation errors
        });
    }
    
    // Proceed if validation passes
    next();
};
