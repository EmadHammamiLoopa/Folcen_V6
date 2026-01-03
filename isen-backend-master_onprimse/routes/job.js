const express = require('express')
const { showJob, storeJob, updateJob, deleteJob, availableJobs, postedJobs, allJobs, showJobDash, destroyJob, disableJob, clearJobReports, reportJob, toggleJobStatus } = require('../app/controllers/jobController')
const Response = require('../app/controllers/Response')
const { requireSignin, isAdmin, withAuthUser } = require('../app/middlewares/auth')
const form = require('../app/middlewares/form')
const { jobById, jobOwner, jobStorePermission } = require('../app/middlewares/job')
const { storeJobValidator, updateJobValidator } = require('../app/middlewares/validators/jobValidator')
const { requireLegalAcceptance } = require('../app/middlewares/legal');
const router = express.Router()


router.get('/all', [requireSignin, isAdmin], allJobs)
router.get('/dash/:jobId', [requireSignin, isAdmin], showJobDash)
router.delete('/dash/:jobId', [requireSignin, isAdmin], destroyJob)

router.get('/posted', [requireSignin], postedJobs)
router.get('/available', [requireSignin, withAuthUser], availableJobs)
router.get('/storePermession', [requireSignin, withAuthUser, jobStorePermission], (req, res) => Response.sendResponse(res, true))
router.post('/', [
    form, 
    requireSignin, 
    withAuthUser, 
    jobStorePermission, 
    storeJobValidator,
    requireLegalAcceptance([
        { type: 'terms_and_conditions', versionEnvVar: 'TERMS_VERSION' },
        { type: 'privacy_policy', versionEnvVar: 'PRIVACY_VERSION' },
        { type: 'jobs_disclaimer', versionEnvVar: 'JOBS_DISCLAIMER_VERSION' }
    ])
], storeJob)
// router.post('/disable/:jobId', [requireSignin, jobOwner], disableJob)

router.post('/:jobId/status', [requireSignin, isAdmin], toggleJobStatus)

router.post('/:jobId/clearReports', [requireSignin, isAdmin], clearJobReports)
router.post('/:jobId/report', [requireSignin], reportJob)
router.get('/:jobId',[requireSignin], showJob)
router.put('/:jobId', [form, requireSignin, jobOwner, updateJobValidator], updateJob)
router.delete('/:jobId', [requireSignin, jobOwner], deleteJob)

router.param('jobId', jobById)

module.exports = router