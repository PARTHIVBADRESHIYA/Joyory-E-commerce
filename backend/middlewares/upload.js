// upload.js
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from './utils/cloudinary.js';

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        'Invalid file type. Only JPG, PNG, and WebP allowed.'
      )
    );
  }
  cb(null, true);
};

const makeCloudinaryUploader = (folder, maxFiles) =>
  multer({
    storage: new CloudinaryStorage({
      cloudinary,
      params: {
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
        ],
        resource_type: 'image'
      }
    }),
    fileFilter,
    limits: {
      fileSize: 500 * 1024, // 500KB
      files: maxFiles
    }
  });

export const uploadProduct = makeCloudinaryUploader('products', 5);
export const uploadPromotion = makeCloudinaryUploader('promotions', 1);
export const uploadCampaign = makeCloudinaryUploader('campaigns', 1);
export const uploadBlogImage = makeCloudinaryUploader('blogs', 1);
export const uploadCommentImage = makeCloudinaryUploader('comments', 1);
export const uploadCategory = makeCloudinaryUploader('categories', 2);
export const uploaduserProfile = makeCloudinaryUploader('users', 1);
export const uploadBrand = makeCloudinaryUploader("brands", 2); 
export const uploadTones = makeCloudinaryUploader("tones", 2);
export const uploadUndertones = makeCloudinaryUploader("undertones", 2);
export const uploadFamilies = makeCloudinaryUploader("families", 2);
export const uploadFormulations = makeCloudinaryUploader("formulations", 2);
export const uploadSkinType = makeCloudinaryUploader("skin-types", 2);
export const uploadGiftCard = makeCloudinaryUploader("gift-cards", 1);