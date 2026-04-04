const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sub-mgmt-secret-change-in-prod';

/**
 * Verify JWT from Authorization header: "Bearer <token>"
 */
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, name, role }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};

/**
 * Role-based access control middleware
 * @param {string|string[]} roles - allowed roles
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Authentication required.' });
        }
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        if (allowedRoles.includes(req.user.role)) {
            return next();
        }
        return res.status(403).json({ success: false, error: 'Access denied. Insufficient permissions.' });
    };
};

/**
 * Portal users can only access their own resources
 * Expects req.params.id or req.body.customerId to match req.user.id
 */
const requireOwnershipOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (req.user.role === 'ADMIN' || req.user.role === 'INTERNAL') {
        return next();
    }
    // Portal users — ownership checked per-route
    req.portalFilter = true;
    next();
};

module.exports = { requireAuth, requireRole, requireOwnershipOrAdmin, JWT_SECRET };
