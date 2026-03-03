const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    image: [
        {
            type: String
        },
    ],
    readingTime: {
        type: Number,
        required: true
    },
    source: {
        type: String
    }
}
    , { timestamps: true }
);

module.exports = mongoose.model("Blog", blogSchema);
