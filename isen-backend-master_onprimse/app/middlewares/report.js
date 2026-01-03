const Response = require("../controllers/Response")
const Report = require("../models/Report")
const mongoose = require('mongoose');


exports.reportById = async (req, res, next, reportId) => {
  
  console.log("iiiiiiiiiiiiiiiiiiiiiiiiid");
    try {
      // Validate the ID
      if (!reportId || reportId === 'null' || reportId === 'undefined') {
        return Response.sendError(res, 400, 'Invalid report ID');
      }
  
      if (!mongoose.Types.ObjectId.isValid(reportId)) {
        return Response.sendError(res, 400, 'Invalid report ID format');
      }
  
      const report = await Report.findById(reportId);
      if (!report) {
        return Response.sendError(res, 404, 'report not found');
      }
  
      req.report = report; // Attach subscription to request
      next();
    } catch (err) {
      console.error('Error finding report:', err);
      return Response.sendError(res, 500, 'Server error');
    }
  };