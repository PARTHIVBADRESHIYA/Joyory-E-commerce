// upload.js
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from './utils/cloudinary.js';
import streamifier from "streamifier";

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


// export const uploadPdfBuffer = (buffer, filename) => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: "ecards",
//         resource_type: "raw",
//         public_id: filename.replace(".pdf", ""), // clean name
//         format: "pdf",
//       },
//       (err, result) => {
//         if (err) return reject(err);
//         resolve(result);
//       }
//     );
//     streamifier.createReadStream(buffer).pipe(uploadStream);
//   });
// };


export const uploadPdfBuffer = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ecards",
        resource_type: "auto",   // ✅ allow browser to embed
        public_id: filename.replace(".pdf", ""),
        format: "pdf",
        type: "upload",
        access_mode: "public"   // ✅ ensure public URL
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};


// // ✅ For PDF eCards
// const makeCloudinaryPdfUploader = (folder, maxFiles) =>
//   multer({
//     storage: new CloudinaryStorage({
//       cloudinary,
//       params: {
//         folder,
//         allowed_formats: ['pdf'], // only PDF
//         resource_type: 'raw',     // raw = for PDFs, zips, etc.,
//         access_mode: 'public'  // ✅ make PDF publicly downloadable

//       }
//     }),
//     fileFilter: (req, file, cb) => {
//       if (file.mimetype !== 'application/pdf') {
//         return cb(
//           new multer.MulterError(
//             'LIMIT_UNEXPECTED_FILE',
//             'Invalid file type. Only PDF allowed.'
//           )
//         );
//       }
//       cb(null, true);
//     },
//     limits: {
//       fileSize: 2 * 1024 * 1024, // 2MB limit for PDF
//       files: maxFiles
//     }
//   });


const makeCloudinaryPdfUploader = (folder, maxFiles) =>
  multer({
    storage: new CloudinaryStorage({
      cloudinary,
      params: {
        folder,
        allowed_formats: ["pdf"],
        resource_type: "auto",   // ✅ use auto, not raw
        access_mode: "public"
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype !== "application/pdf") {
        return cb(
          new multer.MulterError(
            "LIMIT_UNEXPECTED_FILE",
            "Invalid file type. Only PDF allowed."
          )
        );
      }
      cb(null, true);
    },
    limits: {
      fileSize: 2 * 1024 * 1024,
      files: maxFiles,
    },
  });




export const uploadEcard = makeCloudinaryPdfUploader("ecards", 1);
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
export const uploadSeller = makeCloudinaryUploader("sellers", 10);