const Response = require("../../controllers/Response")
const Validator = require('validatorjs')

exports.storeSubscriptionValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'dayPrice': 'min:0',
        'weekPrice': 'min:0',
        'monthPrice': 'min:0',
        'yearPrice': 'min:0',
        'currency': 'required|max:4'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}

exports.updateSubscriptionValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'dayPrice': 'min:0',
        'weekPrice': 'min:0',
        'monthPrice': 'min:0',
        'yearPrice': 'min:0',
        'currency': 'max:4'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}