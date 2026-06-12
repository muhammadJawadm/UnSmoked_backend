const jwt = require("jsonwebtoken");
const User = require("../models/User");

const verifyAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "Token is not valid" });
    }
    const token = authHeader.replace("Bearer ", "");
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("role");
        if (!user || user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: "Token is not valid" });
    }
};

module.exports = verifyAdmin;
