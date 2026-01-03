const Validator = require('validatorjs')
const Response = require('../../controllers/Response')

exports.storeServiceValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'title': 'min:2|max:50|required',
        'company': 'min:1|max:50|required',
        'city': 'min:2|max:50|required',
        'country': 'min:2|max:50|required',
        'phone': 'max:20|required',
        'description': 'max:255|min:5|required',
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}

exports.updateServiceValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'title': 'min:2|max:50',
        'company': 'min:5|max:50',
        'city': 'min:2|max:50',
        'country': 'min:2|max:50',
        'phone': 'max:12',
        'description': 'max:255|min:5'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}