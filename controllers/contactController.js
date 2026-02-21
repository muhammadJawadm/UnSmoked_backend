const Contact = require("../models/Contact");

// Create contact - User submits an issue
const createContact = async (req, res) => {
    try {
        const { issue } = req.body;
        const userId = req.user.id;
        const contact = new Contact({ userId, issue, status: "pending" });
        await contact.save();
        res.status(201).json({ message: "Contact created successfully", contact });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all contacts (admin)
const getContacts = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Unauthorized" });
        }
        const contacts = await Contact.find().populate("userId", "name email").sort({ createdAt: -1 });
        res.status(200).json({ message: "Contacts fetched successfully", contacts });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get single contact
const getContact = async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id).populate("userId", "name email");
        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }
        res.status(200).json({ message: "Contact fetched successfully", contact });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update contact - Admin responds to issue
const updateContact = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Unauthorized" });
        }
        const { response, status } = req.body;
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { response, status },
            { new: true }
        ).populate("userId", "name email");

        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }
        res.status(200).json({ message: "Contact updated successfully", contact });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete contact
const deleteContact = async (req, res) => {
    try {
        const userId = req.user.id;

        // First, check if contact exists and verify ownership
        const contact = await Contact.findById(req.params.id);
        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }
        if (contact.userId.toString() !== userId) {
            return res.status(403).json({ message: "You are not authorized to delete this contact" });
        }

        // Now delete the contact
        await Contact.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Contact deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createContact, getContacts, getContact, updateContact, deleteContact };