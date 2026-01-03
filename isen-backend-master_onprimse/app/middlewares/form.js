const formidable = require('formidable');
const Response = require('../controllers/Response');

module.exports = (req, res, next) => {
    console.log('Formidable middleware triggered');
    try {
        let form = new formidable.IncomingForm()
        console.log('IncomingFormIncomingFormIncomingFormIncomingForm middleware triggered',form);

        form.keepExtensions = true;
        form.parse(req, (err, fields, files) => {
            if(err) {
                console.error('Formidable error:', err);
                return Response.sendError(res, 400, 'unable to handle the data form')
            }
            req.fields = fields
            req.files = files
            console.log('Formidable parsed fields:', fields);
            console.log('Formidable parsed files:', files);
            next()
        });
    } catch (error) {
       console.error('Formidable catch error:', error); 
    }
}