const PrivacyPolicy = require("../models/PrivacyPolicy");

// GET /privacy-policy — public, no login required
exports.getPrivacyPolicy = async (req, res) => {
    try {
        const policy = await PrivacyPolicy.findOne().sort({ updatedAt: -1 });
        res.status(200).json({
            success: true,
            privacyPolicy: policy || { content: "", updatedAt: null },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /privacy-policy — admin only
exports.updatePrivacyPolicy = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { content } = req.body;
        if (!content || typeof content !== "string" || !content.trim()) {
            return res.status(400).json({ success: false, message: "content is required" });
        }

        const policy = await PrivacyPolicy.findOneAndUpdate(
            {},
            { content, updatedBy: req.user.id },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({
            success: true,
            message: "Privacy Policy updated successfully",
            privacyPolicy: policy,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
