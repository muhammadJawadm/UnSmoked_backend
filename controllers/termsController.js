const TermsAndConditions = require("../models/TermsAndConditions");

// GET /terms — public, no login required
exports.getTerms = async (req, res) => {
    try {
        const terms = await TermsAndConditions.findOne().sort({ updatedAt: -1 });
        res.status(200).json({
            success: true,
            terms: terms || { content: "", updatedAt: null },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /terms — admin only
exports.updateTerms = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { content } = req.body;
        if (!content || typeof content !== "string" || !content.trim()) {
            return res.status(400).json({ success: false, message: "content is required" });
        }

        const terms = await TermsAndConditions.findOneAndUpdate(
            {},
            { content, updatedBy: req.user.id },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({
            success: true,
            message: "Terms & Conditions updated successfully",
            terms,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
