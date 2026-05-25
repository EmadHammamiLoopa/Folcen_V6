exports.invalidTokenError = (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        console.warn('[ERROR-MW] invalid token error for', req.method, req.originalUrl);
        return res.status(401).send('invalid token');
    }
    next()
}

exports.notFoundError = (req, res, next) => {
    // Silence noisy but harmless browser/health-check probes
    const silent = ['/favicon.ico', '/robots.txt', '/'];
    if (!silent.includes(req.originalUrl)) {
        console.warn('[ERROR-MW] 404 not found for', req.method, req.originalUrl, 'AuthHeader:', req.headers && req.headers.authorization ? 'yes' : 'no');
    }
    try {
        console.debug('[ERROR-MW] 404 request details headers:', Object.keys(req.headers || {}).slice(0,10));
    } catch (e) {}
    res.status(404).send("Cannot find this url")
}