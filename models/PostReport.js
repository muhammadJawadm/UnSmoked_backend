const mongoose = require("mongoose");

const postReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    reason: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("PostReport", postReportSchema);
