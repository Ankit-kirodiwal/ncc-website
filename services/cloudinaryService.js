const cloudinary = require("cloudinary").v2;

const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function ensureCloudinaryConfigured() {
  if (!isConfigured) {
    throw new Error(
      "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
  }
}

function uploadBufferToCloudinary(buffer, options = {}) {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    uploadStream.end(buffer);
  });
}

async function deleteFromCloudinary(publicId) {
  if (!publicId || !isConfigured) {
    return null;
  }

  return cloudinary.uploader.destroy(publicId);
}

module.exports = {
  cloudinary,
  ensureCloudinaryConfigured,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
  isConfigured
};
