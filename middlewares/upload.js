import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from './utils/cloudinary.js';

// Set up Cloudinary Storage
const makeCloudinaryUploader = (folder) =>
  multer({
    storage: new CloudinaryStorage({
      cloudinary,
      params: {
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, crop: 'limit' }]
      }
      
    })
    
  },
);

export const uploadProduct = makeCloudinaryUploader('products');
export const uploadPromotion = makeCloudinaryUploader('promotions');
export const uploadCampaign = makeCloudinaryUploader('campaigns');
export const uploadBlogImage = makeCloudinaryUploader('blogs');



