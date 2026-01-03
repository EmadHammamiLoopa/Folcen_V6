const Response = require("../../controllers/Response")
const Validator = require('validatorjs')

exports.storeChannelValidator = (req, res, next) => {
    // Make description and category optional to match frontend payloads
    const validation = new Validator(req.fields, {
        'name': 'min:2|max:50|required',
        'description': 'max:255|min:0',
        'category': 'min:1'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}