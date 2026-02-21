const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "targetType",
        required: true
    },
    targetType: {
        type: String,
        enum: ["Post", "Blog"],
        required: true
    },
    text: {
        type: String,
        required: true
    },

},
    { timestamps: true }
);

module.exports = mongoose.model("Comment", commentSchema);