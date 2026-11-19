const jwt = require("jsonwebtoken");

const generateToken = (userId, role = "user") => {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: "180d" });
};

module.exports = generateToken;