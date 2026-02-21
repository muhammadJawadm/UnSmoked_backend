const mongoose = require("mongoose");

const badgeTemplateSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },
        imageUrl: {
            type: String,
            required: true
        },

        type: {
            type: String,
            enum: ["streak", "completion", "competition", "milestone"],
            required: true
        },

        conditionValue: {
            type: Number,
            required: true
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("BadgeTemplate", badgeTemplateSchema);
