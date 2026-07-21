const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} buffer       - File buffer from multer memoryStorage
 * @param {String} folder       - Cloudinary folder (e.g. "badges")
 * @param {String} resourceType - "image" | "raw" | "auto"
 * @returns {Promise<Object>}   - Cloudinary upload result (result.secure_url is the URL)
 */
const uploadToCloudinary = (buffer, folder = "uploads", resourceType = "image") => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: resourceType },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
};

module.exports = { uploadToCloudinary };
