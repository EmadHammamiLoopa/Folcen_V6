const Response = require("../../controllers/Response")
const Validator = require('validatorjs')

exports.storePostValidator = (req, res, next) => {
    const validation = new Validator(req.body, {
        'text': 'min:1|max:255|required',
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}