const Validator = require('validatorjs')
const Response = require('../../controllers/Response')

exports.storeProductValidator = (req, res, next) => {
    try {
        // Ensure tags are parsed as an array
        if (typeof req.fields.tags === 'string') {
            req.fields.tags = JSON.parse(req.fields.tags);
        }
    } catch (error) {
        return Response.sendError(res, 400, 'Invalid tags format');
    }

    const validation = new Validator(req.fields, {
        'label': 'min:2|max:50|required',
        'description': 'min:5|max:255|required',
        'price': 'numeric|required',
        'currency': 'min:2|max:5|required',
        'category': 'required',
        'stock': 'numeric|min:0|required',
        'brand': 'string',
        'condition': 'string',
        'weight': 'string',
        'dimensions.length': 'string',
        'dimensions.width': 'string',
        'dimensions.height': 'string',
        'tags': 'array'
    });

    if (validation.fails()) {
        return Response.sendError(res, 400, validation.errors);
    }

    next();
};

exports.updateProductValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'label': 'min:2|max:50',
        'description': 'min:5|max:255',
        'price': 'numeric',
        'currency': 'min:2|max:5',
        'category': 'required',
        'stock': 'numeric|min:0',
        'brand': 'string',
        'condition': 'string',
        'weight': 'string',
        'dimensions.length': 'string',
        'dimensions.width': 'string',
        'dimensions.height': 'string',
        'tags': 'array'
    });
    if (validation.fails()) return Response.sendError(res, 400, validation.errors);
    next();
};
