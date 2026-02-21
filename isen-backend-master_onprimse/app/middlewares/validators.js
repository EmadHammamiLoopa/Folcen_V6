/**
 * Request validation middleware for GDPR and other endpoints
 */

/**
 * Validates GDPR rectification request body
 */
const rectifySchema = (req, res, next) => {
  const { field, newValue } = req.body;

  if (!field || typeof field !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Field name is required and must be a string'
    });
  }

  if (newValue === undefined) {
    return res.status(400).json({
      success: false,
      message: 'New value is required'
    });
  }

  // Whitelist of fields that can be rectified
  const allowedFields = [
    'firstName',
    'lastName',
    'email',
    'birthDate',
    'gender',
    'city',
    'country',
    'address',
    'aboutMe',
    'school',
    'education',
    'profession',
    'interests',
    'languages'
  ];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({
      success: false,
      message: `Field '${field}' cannot be rectified. Allowed fields: ${allowedFields.join(', ')}`
    });
  }

  next();
};

module.exports = {
  rectifySchema
};
