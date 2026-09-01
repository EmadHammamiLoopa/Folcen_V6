const Response = require('./Response')
const { removeManagedMedia } = require('../utils/contentMediaLifecycle');
const fs = require('fs')
const fsp = fs.promises
const Product = require('../models/Product')
const User = require('../models/User')
const _ = require('lodash')
const path = require('path')
const { asset, extractDashParams, report } = require('../helpers')
const mongoose  = require('mongoose')
const Report = require('../models/Report')
const { dismissEntityReports, resolveEntityReports } = require('../utils/reportModeration');
const { authUser } = require('./AuthController')

// Create a short excerpt like Facebook: cut at word boundary and append ellipsis
const makeExcerpt = (text, max = 150) => {
    if (!text) return text;
    if (text.length <= max) return text;
    const truncated = text.slice(0, max);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > Math.floor(max * 0.6)) {
        return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
}

exports.reportProduct = async (req, res) => {
    try {
        const product = req.product;

        const reportInstance = await report(req, res, 'Product', product._id);
        if (!reportInstance || res.headersSent) return;

        await Product.updateOne({ _id: product._id }, { $push: { reports: reportInstance._id } });
        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Server error');
        }
    }
};


exports.clearProductReports = async (req, res) => {
    try {
        const result =
            await dismissEntityReports({
                entityId:
                    req.product._id,
                entityModel:
                    'Product'
            });

        await Product.updateOne(
            {
                _id:
                    req.product._id
            },
            {
                $set: {
                    reports: []
                }
            }
        );

        return Response.sendResponse(
            res,
            {
                dismissedReports:
                    result.dismissedReports,
                retentionDate:
                    result.retentionDate
            },
            'Reports cleared from active moderation queue'
        );
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'failed to clear reports');
    }
};


exports.toggleProductStatus = async (req, res) => {
    try {
        const product = req.product;
        product.deletedAt = product.deletedAt ? null : new Date().toJSON();
        await product.save();

        return Response.sendResponse(res, product, 'Product ' + (product.deletedAt ? 'disabled' : 'enabled'));
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update product status');
    }
};


exports.showProductDash = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.product._id })
            .populate({
                path: 'user',
                select: 'firstName lastName email mainAvatar'
            })
            .populate({
                path: 'reports',
                populate: {
                    path: 'reporter',
                    select: 'firstName lastName email'
                }
            });

        if (!product) return Response.sendError(res, 404, 'Product not found');

        const productData = product.toObject();
        productData.id = product._id;

        return Response.sendResponse(res, productData);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.allProducts = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['label', 'description', 'country', 'city']);

        // Use aggregation pipeline
        const products = await Product.aggregate()
            .match(dashParams.filter)
            .project({
                _id: 1,
                label: 1,
                description: 1,
                price: 1,
                currency: 1,
                photos: 1,
                country: 1,
                city: 1,
                available: { $cond: ["$sold", false, true] },
                deletedAt: 1,
                reports: { $size: { $ifNull: ["$reports", []] } }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        if (!products) return Response.sendError(res, 500, 'Server error, please try again later');

        // Count total products
        const count = await Product.countDocuments(dashParams.filter);

        return Response.sendResponse(res, {
            docs: products,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.showProduct = (req, res) => {
    return Response.sendResponse(res, req.product)
}

exports.postedProducts = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            label: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const products = await Product.find(filter, {
            label: 1,
            photos: 1,
            price: 1,
            currency: 1,
            country: 1,
            city: 1,
            description: 1,
            createdAt: 1,
            sold: 1  // Include the "sold" status

        })
        .sort({ createdAt: -1 })
        .skip(limit * page)
        .limit(limit);

        if (!products) return Response.sendError(res, 400, 'Cannot retrieve products');

        const productsWithExcerpts = products.map(product => {
            const p = product.toObject();
            const ex = makeExcerpt(p.description, 150);
            p.excerpt = ex;
            p.description = ex; // shortened for list view
            return p;
        });

        const count = await Product.countDocuments(filter);

        return Response.sendResponse(res, {
            products: productsWithExcerpts,
            more: (count - limit * (page + 1)) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};


exports.availableProducts = async (req, res) => {
    try {
        // Get disabled, deleted, or banned users to exclude their products
        const inactiveUsers = await User.find({
            $or: [
                { enabled: false },
                { isDeleted: true },
                { deletedAt: { $ne: null } },
                { banned: true }
            ]
        }).select('_id');
        const inactiveUserIds = inactiveUsers.map(u => u._id);

        const filter = {
            label: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            sold: false,
            country: req.authUser.country,
            city: req.authUser.city,
            user: { $nin: inactiveUserIds }
        };

        if (req.query.category && req.query.category !== 'All') {
            filter.category = req.query.category;
        }

        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        // Fetch the products
        const products = await Product.find(filter, {
            label: 1,
            photos: 1,
            price: 1,
            currency: 1,
            country: 1,
            city: 1,
            description: 1,
            createdAt: 1,
            category: 1  // Include category in the fields to be returned
        })
            .sort({ createdAt: -1 })
            .skip(limit * page)
            .limit(limit);

        if (!products) return Response.sendError(res, 400, 'Cannot retrieve products');

        const productsWithExcerpts = products.map(product => {
            const p = product.toObject();
            const ex = makeExcerpt(p.description, 150);
            p.excerpt = ex;
            p.description = ex; // shortened for list view
            return p;
        });

        // Count the total number of products matching the filter
        const count = await Product.countDocuments(filter);

        return Response.sendResponse(res, {
            products: productsWithExcerpts,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.storeProduct = async (req, res) => {
    try {
        console.log('Product form fields parsed');
        console.log('Product file metadata parsed');

        const dimensions = req.fields.dimensions ? JSON.parse(req.fields.dimensions) : { length: '0', width: '0', height: '0' };

        // Always derive the posting user from the authenticated request user
        const postingUserId = req.authUser && req.authUser._id ? req.authUser._id : null;
        const product = new Product({
            label: req.fields.label,
            price: req.fields.price,
            currency: req.fields.currency,
            description: req.fields.description,
            user: postingUserId,
            category: req.fields.category,
            stock: req.fields.stock,
            brand: req.fields.brand,
            condition: req.fields.condition,
            weight: req.fields.weight,
            dimensions: {
                length: dimensions.length || '0',
                width: dimensions.width || '0',
                height: dimensions.height || '0',
            },
            country: req.fields.country,
            city: req.fields.city,
            tags: req.fields.tags,
        });

        if (req.files) {
            const photos = Object.keys(req.files).filter(key => key.startsWith('photos[')).map(key => req.files[key]);

            if (photos.length === 0) {
                console.error('No photos found in the request');
                return Response.sendError(res, 400, 'At least one photo is required');
            }

            await storeProductPhotos(photos, product);
        } else {
            console.error('Files object is undefined');
            return Response.sendError(res, 400, 'At least one photo is required');
        }

        console.log('Product save requested');
        await product.save();
        console.log('Product saved successfully');
        // Send notification to followers and friends (match jobs/services behavior)
        try {
            const notificationTitle = `${req.authUser.firstName} ${req.authUser.lastName}`;
            const notificationBody = `listed a new product: ${product.label}`;

            let recipients = [];
            if (product.visibility === 'public') {
                recipients = [...(req.authUser.followers || []), ...(req.authUser.friends || [])];
            } else if (product.visibility === 'friends-only') {
                recipients = [...(req.authUser.friends || [])];
            }

            recipients = [...new Set(recipients.map(id => id.toString()))].filter(id => id !== req.auth._id.toString());

            if (recipients.length > 0) {
                const { sendNotification } = require('../helpers');
                sendNotification(
                    { en: notificationTitle },
                    { en: notificationBody },
                    { type: 'followed_user_created_product', link: `/tabs/buy-and-sell/product/${product._id}` },
                    [],
                    recipients
                );

                // Emit socket event for real-time badges (targeted to recipients only)
                try {
                    const { emitToUser: _emit } = require('../helpers');
                    recipients.forEach(uid => _emit(uid, 'new-buy-sell-update', { productId: product._id }));
                } catch (e) {}
            }
        } catch (e) {
            console.warn('Failed to send product notifications', e && e.message);
        }

        return Response.sendResponse(res, product, 'The product has been created successfully');
    } catch (error) {
        console.log('Server error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};


const storeProductPhotos = async (photos, product) => {
    if (!Array.isArray(photos)) {
        photos = [photos];
    }

    product.photos = [];

    for (let i = 0; i < photos.length; i++) {
        try {
            const photoName = `${product._id}_${i}${path.extname(photos[i].name)}`;
            const photoPath = path.join(__dirname, `../../public/products/${photoName}`);

            // Ensure the public/products directory exists
            const dir = path.dirname(photoPath);
            await fs.promises.mkdir(dir, { recursive: true });

            // Write the photo file
            await fs.promises.writeFile(photoPath, await fs.promises.readFile(photos[i].path));

            // Add the relative path and type to the product photos array
            product.photos.push({ path: `/products/${photoName}`, type: photos[i].type });
        } catch (error) {
            console.error(`Failed to store photo ${photos[i].name}:`, error);
            throw new Error('Failed to store product photos');
        }
    }

    console.log('Product photos stored:', Array.isArray(product.photos) ? product.photos.length : 0);
};




exports.updateProduct = async (req, res) => {
    try {
        let product = req.product;

        const previousProductPhotoPaths =
            Array.isArray(product.photos)
                ? product.photos
                    .map(photo =>
                        typeof photo === 'string'
                            ? photo
                            : photo && photo.path
                    )
                    .filter(Boolean)
                : [];

        // Omit 'photos' from the incoming fields to avoid overwriting them directly
        const fieldsToUpdate = _.omit(req.fields, ['photos']);
        product = _.extend(product, fieldsToUpdate);  // Extend the product with new fields

        // If new photos are uploaded, process them and add to the product
        if (req.files && req.files.photos) {
            const photos = Array.isArray(req.files.photos) ? req.files.photos : [req.files.photos];
            await storeProductPhotos(photos, product);
        }

        // Save the updated product
        await product.save();

        if (req.files && req.files.photos) {
            const currentProductPhotoPaths =
                new Set(
                    Array.isArray(product.photos)
                        ? product.photos
                            .map(photo =>
                                typeof photo === 'string'
                                    ? photo
                                    : photo && photo.path
                            )
                            .filter(Boolean)
                        : []
                );

            const replacedProductPhotoPaths =
                previousProductPhotoPaths.filter(
                    oldPath =>
                        !currentProductPhotoPaths.has(oldPath)
                );

            await Promise.all(
                replacedProductPhotoPaths.map(
                    async oldPath => {
                        try {
                            await removeManagedMedia(oldPath);
                        } catch (error) {
                            console.warn(
                                'Failed to clean replaced product photo',
                                oldPath,
                                error
                            );
                        }
                    }
                )
            );
        }

        return Response.sendResponse(res, product, 'Product updated successfully');
    } catch (error) {
        console.error('Error updating product:', error);
        return Response.sendError(res, 500, 'Could not update product');
    }
};


exports.deleteProduct = async (req, res) => {
    // The legacy owner-delete path already hard-deleted the Product document.
    // Route it through the complete destructive lifecycle so photos and
    // moderation evidence are not orphaned.
    return exports.destroyProduct(
        req,
        res
    );
};

exports.soldProduct = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.product._id });

        if (!product) {
            return Response.sendError(res, 400, 'Product not found');
        }

        product.sold = true;

        await product.save();
        return Response.sendResponse(res, true, 'Product is marked as sold');

    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Cannot mark this product as sold now, try again later');
    }
};


exports.destroyProduct = async (req, res) => {
    const product =
        req.product;

    try {
        const photos =
            Array.isArray(
                product.photos
            )
                ? product.photos
                : [];

        await Promise.all(
            photos
                .map(
                    photo =>
                        (
                            typeof photo ===
                                'string'
                                ? photo
                                : (
                                    photo &&
                                    photo.path
                                )
                        )
                )
                .filter(Boolean)
                .map(
                    photoPath =>
                        removeManagedMedia(
                            photoPath
                        )
                )
        );

        await resolveEntityReports({
            entityId:
                product._id,

            entityModel:
                'Product',

            moderatorNote:
                'Product removed'
        });

        await Product.deleteOne({
            _id:
                product._id
        });

        return Response.sendResponse(
            res,
            null,
            'Product removed'
        );

    } catch (err) {
        console.log(err);

        return Response.sendError(
            res,
            400,
            'Could not remove product'
        );
    }
};
