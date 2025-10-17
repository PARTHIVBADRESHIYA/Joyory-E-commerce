// // upload.js
// import multer from 'multer';
// import { CloudinaryStorage } from 'multer-storage-cloudinary';
// import cloudinary from './utils/cloudinary.js';
// import streamifier from "streamifier";

// const fileFilter = (req, file, cb) => {
//   const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
//   if (!allowedMimeTypes.includes(file.mimetype)) {
//     return cb(
//       new multer.MulterError(
//         'LIMIT_UNEXPECTED_FILE',
//         'Invalid file type. Only JPG, PNG, and WebP allowed.'
//       )
//     );
//   }
//   cb(null, true);
// };

// const makeCloudinaryUploader = (folder, maxFiles) =>
//   multer({
//     storage: new CloudinaryStorage({
//       cloudinary,
//       params: {
//         folder,
//         allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
//         transformation: [
//           { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
//         ],
//         resource_type: 'image'
//       }
//     }),
//     fileFilter,
//     limits: {
//       fileSize: 500 * 1024, // 500KB
//       files: maxFiles
//     }
//   });

// export const uploadPdfBuffer = (buffer, filename) => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: "ecards",
//         resource_type: "auto",   // ✅ allow browser to embed
//         public_id: filename.replace(".pdf", ""),
//         format: "pdf",
//         type: "upload",
//         access_mode: "public"   // ✅ ensure public URL
//       },
//       (err, result) => {
//         if (err) return reject(err);
//         resolve(result);
//       }
//     );
//     streamifier.createReadStream(buffer).pipe(uploadStream);
//   });
// };

// const makeCloudinaryPdfUploader = (folder, maxFiles) =>
//   multer({
//     storage: new CloudinaryStorage({
//       cloudinary,
//       params: {
//         folder,
//         allowed_formats: ["pdf"],
//         resource_type: "auto",   // ✅ use auto, not raw
//         access_mode: "public"
//       }
//     }),
//     fileFilter: (req, file, cb) => {
//       if (file.mimetype !== "application/pdf") {
//         return cb(
//           new multer.MulterError(
//             "LIMIT_UNEXPECTED_FILE",
//             "Invalid file type. Only PDF allowed."
//           )
//         );
//       }
//       cb(null, true);
//     },
//     limits: {
//       fileSize: 2 * 1024 * 1024,
//       files: maxFiles,
//     },
//   });

// export const uploadProductWithVariants = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: {
//       folder: "products",
//       allowed_formats: ["jpg", "jpeg", "png", "webp"],
//       transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto:good" }],
//       resource_type: "image",
//     },
//   }),
//   fileFilter,
//   limits: {
//     fileSize: 500 * 1024, // 500KB each
//     files: 50,            // allow up to 50 total (5 per 10 variants, for example)
//   },
// }).any(); // 👈 accepts any fields like "images", "variantImages_0", "variantImages_12"



// export const uploadEcard = makeCloudinaryPdfUploader("ecards", 1);
// export const uploadProduct = makeCloudinaryUploader('products', 25);
// export const uploadPromotion = makeCloudinaryUploader('promotions', 1);
// export const uploadCampaign = makeCloudinaryUploader('campaigns', 1);
// export const uploadBlogImage = makeCloudinaryUploader('blogs', 1);
// export const uploadCommentImage = makeCloudinaryUploader('comments', 1);
// export const uploadCategory = makeCloudinaryUploader('categories', 20);
// export const uploaduserProfile = makeCloudinaryUploader('users', 10);
// export const uploadBrand = makeCloudinaryUploader("brands", 2);
// export const uploadTones = makeCloudinaryUploader("tones", 2);
// export const uploadUndertones = makeCloudinaryUploader("undertones", 2);
// export const uploadFamilies = makeCloudinaryUploader("families", 2);
// export const uploadFormulations = makeCloudinaryUploader("formulations", 2);
// export const uploadSkinType = makeCloudinaryUploader("skin-types", 2);
// export const uploadGiftCard = makeCloudinaryUploader("gift-cards", 1);
// export const uploadSeller = makeCloudinaryUploader("sellers", 100);



// upload.js
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from './utils/cloudinary.js';
import streamifier from "streamifier";

// -------------------- File Filter --------------------
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

// -------------------- Generic Cloudinary Uploader --------------------
const makeCloudinaryUploader = (folder, maxFiles) =>
  multer({
    storage: new CloudinaryStorage({
      cloudinary,
      params: {
        folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ quality: 'auto:none' }], // ✅ keep original quality
        resource_type: 'image'
      }
    }),
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // increased limit to 5MB
      files: maxFiles
    }
  });

// -------------------- PDF Upload (Buffer or Multer) --------------------
export const uploadPdfBuffer = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ecards",
        resource_type: "auto",
        public_id: filename.replace(".pdf", ""),
        format: "pdf",
        type: "upload",
        access_mode: "public"
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const makeCloudinaryPdfUploader = (folder, maxFiles) =>
  multer({
    storage: new CloudinaryStorage({
      cloudinary,
      params: {
        folder,
        allowed_formats: ["pdf"],
        resource_type: "auto",
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
      fileSize: 10 * 1024 * 1024, // 10MB
      files: maxFiles,
    },
  });

// -------------------- Product Variant Uploader --------------------
export const uploadProductWithVariants = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: "products",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ quality: 'auto:none' }], // ✅ original quality
      resource_type: "image",
    },
  }),
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1 MB each
    files: 50,
  },
}).any();

// -------------------- Exported Uploaders --------------------
export const uploadEcard = makeCloudinaryPdfUploader("ecards", 1);
export const uploadProduct = makeCloudinaryUploader('products', 25);
export const uploadPromotion = makeCloudinaryUploader('promotions', 1);
export const uploadCampaign = makeCloudinaryUploader('campaigns', 1);
export const uploadBlogImage = makeCloudinaryUploader('blogs', 1);
export const uploadCommentImage = makeCloudinaryUploader('comments', 1);
export const uploadCategory = makeCloudinaryUploader('categories', 20);
export const uploaduserProfile = makeCloudinaryUploader('users', 10);
export const uploadBrand = makeCloudinaryUploader("brands", 2);
export const uploadTones = makeCloudinaryUploader("tones", 2);
export const uploadUndertones = makeCloudinaryUploader("undertones", 2);
export const uploadFamilies = makeCloudinaryUploader("families", 2);
export const uploadFormulations = makeCloudinaryUploader("formulations", 2);
export const uploadSkinType = makeCloudinaryUploader("skin-types", 2);
export const uploadGiftCard = makeCloudinaryUploader("gift-cards", 1);
export const uploadSeller = makeCloudinaryUploader("sellers", 100);
