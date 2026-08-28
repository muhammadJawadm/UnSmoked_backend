const mongoose = require("mongoose");
const Category = require("./Category");

const TemplateSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
            validate: {
                validator: async function (value) {
                    if (!value) return true;
                    const exists = await Category.exists({ _id: value });
                    return !!exists;
                },
                message: "Invalid category. Category must exist.",
            },
        },
        durationDays: { type: Number, default: 1, min: 1 },
        boardSize: { type: Number, default: 50 },       // NEW: metadata (e.g. number of squares)
        isActive: { type: Boolean, default: true },
        isCustom: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Template", TemplateSchema);
