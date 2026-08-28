const express = require('express')
const {
    storeProduct,
    showProduct,
    updateProduct,
    availableProducts,
    postedProducts,
    allProducts,
    showProductDash,
    destroyProduct,
    deleteProduct,
    soldProduct,
    clearProductReports,
    reportProduct,
    toggleProductStatus,
} = require('../app/controllers/ProductController')
const Response = require('../app/controllers/Response')

const { requireSignin, isAuth, isAdmin, withAuthUser } = require('../app/middlewares/auth')
const form = require('../app/middlewares/form')
const { productById, productOwner, productStorePermission } = require('../app/middlewares/product')
const { storeProductValidator, updateProductValidator } = require('../app/middlewares/validators/productValidator')
const { requireLegalAcceptance } = require('../app/middlewares/legal');
const router = express.Router()


router.param('productId', productById)

router.get('/all', [requireSignin, withAuthUser, isAdmin], allProducts)
router.get('/dash/:productId', [requireSignin, withAuthUser, isAdmin], showProductDash)
router.delete('/dash/:productId', [requireSignin, withAuthUser, isAdmin], destroyProduct)

router.post('/', [
    form,
    requireSignin,
    storeProductValidator,
    withAuthUser,
    requireLegalAcceptance([
        { type: 'terms_and_conditions', versionEnvVar: 'TERMS_VERSION' },
        { type: 'privacy_policy', versionEnvVar: 'PRIVACY_VERSION' },
        { type: 'seller_disclaimer', versionEnvVar: 'SELLER_DISCLAIMER_VERSION' }
    ])
], storeProduct)
router.get('/available', [requireSignin, withAuthUser], availableProducts)
router.get('/posted', [requireSignin], postedProducts)
router.get('/storePermession', [requireSignin, withAuthUser, productStorePermission], (req, res) => Response.sendResponse(res, true))
router.post('/sold/:productId', [requireSignin, withAuthUser, productOwner], soldProduct)

router.post('/:productId/status', [requireSignin, withAuthUser, isAdmin], toggleProductStatus)

router.post('/:productId/clearReports', [requireSignin, withAuthUser, isAdmin], clearProductReports)
router.get('/:productId',[requireSignin], showProduct)
router.put('/:productId', [form, requireSignin, withAuthUser, productOwner, updateProductValidator], updateProduct);
router.delete('/:productId', [requireSignin, withAuthUser, productOwner], deleteProduct)
router.post('/:productId/report', [requireSignin], reportProduct)


module.exports = router