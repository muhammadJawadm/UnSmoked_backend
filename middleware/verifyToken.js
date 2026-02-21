const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Token is not valid" });
    }
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ message: "Token is not valid" });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: "Token is not valid" });
    }
};

module.exports = verifyToken;