const express = require('express')
const Response = require('../app/controllers/Response')
const {
    showService,
    storeService,
    updateService,
    postedServices,
    availableServices,
    allServices,
    showServiceDash,
    destroyService,
    clearServiceReports,
    reportService,
    toggleServiceStatus
} = require('../app/controllers/ServiceController')
const { requireSignin, isAdmin, withAuthUser } = require('../app/middlewares/auth')
const form = require('../app/middlewares/form')
const { serviceById, serviceOwner, serviceStorePermission } = require('../app/middlewares/Service')
const { storeServiceValidator, updateServiceValidator } = require('../app/middlewares/validators/serviceValidator')
const { requireLegalAcceptance } = require('../app/middlewares/legal');
const router = express.Router()

router.get('/all', [requireSignin, withAuthUser, isAdmin], allServices)
router.get('/dash/:serviceId', [requireSignin, withAuthUser, isAdmin], showServiceDash)
router.delete('/dash/:serviceId', [requireSignin, withAuthUser, isAdmin], destroyService)

router.get('/posted', [requireSignin], postedServices)
router.get('/available', [requireSignin, withAuthUser], availableServices)
router.post('/', [
    form,
    requireSignin,
    withAuthUser,
    storeServiceValidator,
    requireLegalAcceptance([
        { type: 'terms_and_conditions', versionEnvVar: 'TERMS_VERSION' },
        { type: 'privacy_policy', versionEnvVar: 'PRIVACY_VERSION' },
        { type: 'service_disclaimer', versionEnvVar: 'SERVICE_DISCLAIMER_VERSION' }
    ])
], storeService)
// router.post('/disable/:serviceId', [requireSignin, withAuthUser, serviceOwner], disableService)
router.get('/storePermession', [requireSignin, withAuthUser, serviceStorePermission], (req, res) => Response.sendResponse(res, true))

router.post('/:serviceId/status', [requireSignin, withAuthUser, isAdmin], toggleServiceStatus)

router.post('/:serviceId/clearReports', [requireSignin, withAuthUser, isAdmin], clearServiceReports)
router.get('/:serviceId',[requireSignin], showService)
router.put('/:serviceId', [form, requireSignin, withAuthUser, serviceOwner, updateServiceValidator], updateService)
router.delete('/:serviceId', [requireSignin, withAuthUser, serviceOwner], destroyService)
router.post('/:serviceId/report', [requireSignin], reportService)


router.param('serviceId', serviceById)

module.exports = router
