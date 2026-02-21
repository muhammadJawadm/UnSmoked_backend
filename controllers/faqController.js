const Faq = require("../models/Faq");

// Create FAQ
exports.createFaq = async (req, res) => {
    try {
        const { question, answer, categoryId, is_active } = req.body;
        const faq = new Faq({ question, answer, categoryId, is_active });
        await faq.save();
        res.status(201).json({ message: "FAQ created successfully", faq });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all FAQs
exports.getAllFaqs = async (req, res) => {
    try {
        const faqs = await Faq.find();
        res.status(200).json({ message: "FAQs fetched successfully", faqs });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get FAQ by ID
exports.getFaqById = async (req, res) => {
    try {
        const faq = await Faq.findById(req.params.id);
        if (!faq) {
            return res.status(404).json({ message: "FAQ not found" });
        }
        res.status(200).json({ message: "FAQ fetched successfully", faq });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update FAQ
exports.updateFaq = async (req, res) => {
    try {
        const { question, answer, categoryId, is_active } = req.body;
        const faq = await Faq.findByIdAndUpdate(req.params.id, { question, answer, categoryId, is_active }, { new: true });
        if (!faq) {
            return res.status(404).json({ message: "FAQ not found" });
        }
        res.status(200).json({ message: "FAQ updated successfully", faq });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete FAQ
exports.deleteFaq = async (req, res) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) {
            return res.status(404).json({ message: "FAQ not found" });
        }
        res.status(200).json({ message: "FAQ deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};