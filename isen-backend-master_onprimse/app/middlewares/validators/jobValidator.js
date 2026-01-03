const Validator = require('validatorjs')
const Response = require('../../controllers/Response')

exports.storeJobValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'title': 'min:2|max:50|required',
        'company': 'min:1|max:50|required',
        'city': 'min:2|max:50|required',
        'country': 'min:2|max:50|required',
        'email': 'email|max:50|required',
        'description': 'max:255|min:5|required',
        'jobType': 'in:Full-time,Part-time,Contract,Internship|required',
        'salaryRange': 'string',
        'experienceLevel': 'in:Entry-level,Mid-level,Senior|required',
        'jobCategory': 'min:2|required',
        'remoteOption': 'in:Remote,Onsite,Hybrid|required',
        'applicationDeadline': 'date',
        'jobRequirements': 'min:5|max:500|required',
        'jobBenefits': 'max:255',
        'address': 'max:255',
        'educationLevel': 'in:High School,Bachelor\'s,Master\'s,PhD,Other|required',
        'industry': 'string',
        'website': 'url',
        'jobLocationType': 'in:Headquarters,Branch Office|required'
    })
    if (validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}

exports.updateJobValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'title': 'min:2|max:50',
        'company': 'min:1|max:50',
        'city': 'min:2|max:50|required',
        'country': 'min:2|max:50|required',
        'email': 'email|max:50',
        'description': 'max:255|min:5',
        'jobType': 'in:Full-time,Part-time,Contract,Internship',
        'minSalary': 'numeric|min:1000',  // Validation for minSalary
        'maxSalary': 'numeric|max:1000000', // Validation for maxSalary

        'experienceLevel': 'in:Entry-level,Mid-level,Senior',
        'jobCategory': 'min:2',
        'remoteOption': 'in:Remote,Onsite,Hybrid',
        'applicationDeadline': 'date',
        'jobRequirements': 'min:5|max:500',
        'jobBenefits': 'max:255',
        'address': 'max:255',

        
        'educationLevel': 'in:High School,Bachelor\'s,Master\'s,PhD,Other',
        'industry': 'string',
        'website': 'url',
        'jobLocationType': 'in:Headquarters,Branch Office'
    })
    if (validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}
