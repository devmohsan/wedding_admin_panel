const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET;

const auth = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        req.flash('errors', 'Unauthorized. Please login first.');
        return res.redirect('/');
    }

    try {
        const decoded = jwt.verify(token, secretKey); // 🔄 Removed 'await'
        req.user = decoded;
        res.locals.admin= decoded;
        next();
    } catch (err) {
        console.error('Invalid token:', err.message);
        res.clearCookie('token');
        req.flash('errors', 'Session expired. Please login again.');
        return res.redirect('/');
    }
};

module.exports = auth;
