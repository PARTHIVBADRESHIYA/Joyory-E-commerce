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




































// // upload.js
// import multer from 'multer';
// import { CloudinaryStorage } from 'multer-storage-cloudinary';
// import cloudinary from './utils/cloudinary.js';
// import streamifier from "streamifier";

// // -------------------- File Filter --------------------
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

// // -------------------- Generic Cloudinary Uploader (Original Size) --------------------
// const makeCloudinaryUploader = (folder, maxFiles) =>
//   multer({
//     storage: new CloudinaryStorage({
//       cloudinary,
//       params: {
//         folder,
//         allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
//         resource_type: 'image', // keep as image
//         // NO transformation => original size and quality preserved
//       }
//     }),
//     fileFilter,
//     limits: {
//       fileSize: 1 * 1024 * 1024, // max 10MB
//       files: maxFiles
//     }
//   });

// // -------------------- PDF Upload --------------------
// export const uploadPdfBuffer = (buffer, filename) => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: "ecards",
//         resource_type: "auto",
//         public_id: filename.replace(".pdf", ""),
//         format: "pdf",
//         type: "upload",
//         access_mode: "public"
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
//         resource_type: "auto",
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
//       fileSize: 1 * 1024 * 1024, // max 20MB
//       files: maxFiles,
//     },
//   });

// // -------------------- Product Variant Uploader (Original Size) --------------------
// export const uploadProductWithVariants = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: {
//       folder: "products",
//       allowed_formats: ["jpg", "jpeg", "png", "webp"],
//       resource_type: "image", // original size
//       // NO transformation => exact original file stored
//     },
//   }),
//   fileFilter,
//   limits: {
//     fileSize: 1 * 1024 * 1024, // 10MB per image
//     files: 50,
//   },
// }).any();


// // -------------------- Video Upload --------------------
// export const uploadVideo = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: {
//       folder: "videos",
//       resource_type: "video",
//       allowed_formats: ["mp4", "mov", "avi", "webm", "mkv"],
//       access_mode: "public",
//     },
//   }),
//   fileFilter: (req, file, cb) => {
//     const allowedMimeTypes = [
//       "video/mp4",
//       "video/webm",
//       "video/ogg",
//       "video/quicktime", // .mov
//       "video/x-msvideo", // .avi
//       "video/x-matroska", // .mkv
//     ];
//     if (!allowedMimeTypes.includes(file.mimetype)) {
//       return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Invalid file type. Only video formats allowed."));
//     }
//     cb(null, true);
//   },
//   limits: {
//     fileSize: 100 * 1024 * 1024, // 100MB limit per video
//     files: 1,
//   },
// });

// // -------------------- Universal Image/Video Uploader --------------------
// export const uploadMedia = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: async (req, file) => {
//       // detect type
//       const isVideo = file.mimetype.startsWith("video/");
//       const folder = "uploads"; // single folder for all media (you can change)

//       return {
//         folder,
//         resource_type: isVideo ? "video" : "image",
//         allowed_formats: isVideo
//           ? ["mp4", "mov", "avi", "webm", "mkv"]
//           : ["jpg", "jpeg", "png", "webp"],
//         access_mode: "public",
//       };
//     },
//   }),
//   fileFilter: (req, file, cb) => {
//     const allowedMimeTypes = [
//       // images
//       "image/jpeg",
//       "image/png",
//       "image/webp",
//       // videos
//       "video/mp4",
//       "video/webm",
//       "video/ogg",
//       "video/quicktime",
//       "video/x-msvideo",
//       "video/x-matroska",
//     ];

//     if (!allowedMimeTypes.includes(file.mimetype)) {
//       return cb(
//         new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Invalid file type. Only image/video formats allowed.")
//       );
//     }
//     cb(null, true);
//   },
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB max (covers both image & video)
//     files: 5, // allow up to 5 files
//   },
// });


// // Define allowed MIME types first
// const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"];
// const videoMimeTypes = [
//   "video/mp4",
//   "video/webm",
//   "video/ogg",
//   "video/quicktime", // .mov
//   "video/x-msvideo", // .avi
//   "video/x-matroska", // .mkv
// ];

// export const uploadVideoWithThumbnail = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: async (req, file) => {
//       if (file.fieldname === "video") {
//         return {
//           folder: "videos",
//           resource_type: "video",
//           allowed_formats: ["mp4", "mov", "avi", "webm", "mkv"],
//           access_mode: "public",
//         };
//       } else if (file.fieldname === "thumbnail") {
//         return {
//           folder: "thumbnails",
//           resource_type: "image",
//           allowed_formats: ["jpg", "jpeg", "png", "webp"],
//           access_mode: "public",
//         };
//       }
//     },
//   }),

//   fileFilter: (req, file, cb) => {
//     if (file.fieldname === "video" && videoMimeTypes.includes(file.mimetype)) {
//       return cb(null, true);
//     }
//     if (file.fieldname === "thumbnail" && imageMimeTypes.includes(file.mimetype)) {
//       return cb(null, true);
//     }

//     return cb(
//       new multer.MulterError(
//         "LIMIT_UNEXPECTED_FILE",
//         `Invalid file type for ${file.fieldname}.`
//       )
//     );
//   },

//   limits: {
//     fileSize: 100 * 1024 * 1024, // max 100MB total
//     files: 2, // one video + one thumbnail
//   },
// });

// // -------------------- Exported Uploaders --------------------
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























// // upload.js
// import multer from 'multer';
// import { CloudinaryStorage } from 'multer-storage-cloudinary';
// import cloudinary from './utils/cloudinary.js';
// import streamifier from "streamifier";

// // -------------------- File Filter (Images) --------------------
// const fileFilter = (req, file, cb) => {
//   const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
//   if (!allowedMimeTypes.includes(file.mimetype)) {
//     return cb(new Error("Invalid file type. Only JPG, PNG, and WebP allowed."), false);
//   }
//   cb(null, true);
// };

// // -------------------- Generic Cloudinary Uploader (Original Size) --------------------
// const makeCloudinaryUploader = (folder, maxFiles) =>
//   multer({
//     storage: new CloudinaryStorage({
//       cloudinary,
//       params: {
//         folder,
//         allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
//         resource_type: 'image',
//       }
//     }),
//     fileFilter,
//     limits: {
//       fileSize: 10 * 1024 * 1024,
//       files: maxFiles,
//     },
//   });

// // -------------------- PDF Upload Buffer --------------------
// export const uploadPdfBuffer = (buffer, filename) => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: "ecards",
//         resource_type: "auto",
//         public_id: filename.replace(".pdf", ""),
//         format: "pdf",
//         type: "upload",
//         access_mode: "public",
//       },
//       (err, result) => {
//         if (err) return reject(err);
//         resolve(result);
//       }
//     );
//     streamifier.createReadStream(buffer).pipe(uploadStream);
//   });
// };

// // -------------------- PDF Uploader --------------------
// const makeCloudinaryPdfUploader = (folder, maxFiles) =>
//   multer({
//     storage: new CloudinaryStorage({
//       cloudinary,
//       params: {
//         folder,
//         allowed_formats: ["pdf"],
//         resource_type: "auto",
//         access_mode: "public",
//       },
//     }),
//     fileFilter: (req, file, cb) => {
//       if (file.mimetype !== "application/pdf") {
//         return cb(new Error("Invalid file type. Only PDF allowed."), false);
//       }
//       cb(null, true);
//     },
//     limits: {
//       fileSize: 20 * 1024 * 1024,
//       files: maxFiles,
//     },
//   });

// // -------------------- Product Variant (Original Size) --------------------
// export const uploadProductWithVariants = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: {
//       folder: "products",
//       allowed_formats: ["jpg", "jpeg", "png", "webp"],
//       resource_type: "image",
//     },
//   }),
//   fileFilter,
//   limits: {
//     fileSize: 10 * 1024 * 1024,
//     files: 50,
//   },
// }).any();

// // -------------------- Video Upload --------------------
// export const uploadVideo = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: {
//       folder: "videos",
//       resource_type: "video",
//       allowed_formats: ["mp4", "mov", "avi", "webm", "mkv"],
//       access_mode: "public",
//     },
//   }),
//   fileFilter: (req, file, cb) => {
//     const allowedMimeTypes = [
//       "video/mp4",
//       "video/webm",
//       "video/ogg",
//       "video/quicktime",
//       "video/x-msvideo",
//       "video/x-matroska",
//     ];
//     if (!allowedMimeTypes.includes(file.mimetype)) {
//       return cb(new Error("Invalid video type."), false);
//     }
//     cb(null, true);
//   },
//   limits: {
//     fileSize: 100 * 1024 * 1024,
//     files: 1,
//   },
// });

// // -------------------- Universal Media Uploader --------------------
// export const uploadMedia = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: async (req, file) => {
//       const isVideo = file.mimetype.startsWith("video/");
//       return {
//         folder: "uploads",
//         resource_type: isVideo ? "video" : "image",
//         allowed_formats: isVideo
//           ? ["mp4", "mov", "avi", "webm", "mkv"]
//           : ["jpg", "jpeg", "png", "webp"],
//         access_mode: "public",
//       };
//     },
//   }),
//   fileFilter: (req, file, cb) => {
//     const allowedMimeTypes = [
//       "image/jpeg",
//       "image/png",
//       "image/webp",
//       "video/mp4",
//       "video/webm",
//       "video/ogg",
//       "video/quicktime",
//       "video/x-msvideo",
//       "video/x-matroska",
//     ];

//     if (!allowedMimeTypes.includes(file.mimetype)) {
//       return cb(new Error("Invalid media type."), false);
//     }
//     cb(null, true);
//   },
//   limits: {
//     fileSize: 10 * 1024 * 1024,
//     files: 5,
//   },
// });

// // -------------------- Video + Thumbnail --------------------
// const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"];
// const videoMimeTypes = [
//   "video/mp4",
//   "video/webm",
//   "video/ogg",
//   "video/quicktime",
//   "video/x-msvideo",
//   "video/x-matroska",
// ];

// export const uploadVideoWithThumbnail = multer({
//   storage: new CloudinaryStorage({
//     cloudinary,
//     params: async (req, file) => {
//       if (file.fieldname === "video") {
//         return {
//           folder: "videos",
//           resource_type: "video",
//           allowed_formats: ["mp4", "mov", "avi", "webm", "mkv"],
//           access_mode: "public",
//         };
//       } else if (file.fieldname === "thumbnail") {
//         return {
//           folder: "thumbnails",
//           resource_type: "image",
//           allowed_formats: ["jpg", "jpeg", "png", "webp"],
//           access_mode: "public",
//         };
//       }
//     },
//   }),

//   fileFilter: (req, file, cb) => {
//     if (file.fieldname === "video" && videoMimeTypes.includes(file.mimetype)) {
//       return cb(null, true);
//     }
//     if (file.fieldname === "thumbnail" && imageMimeTypes.includes(file.mimetype)) {
//       return cb(null, true);
//     }

//     return cb(new Error(`Invalid file type for ${file.fieldname}.`), false);
//   },

//   limits: {
//     fileSize: 100 * 1024 * 1024,
//     files: 2,
//   },
// });

// // -------------------- Exported Uploaders --------------------
// export const uploadEcard = makeCloudinaryPdfUploader("ecards", 1);
// export const uploadProduct = makeCloudinaryUploader("products", 25);
// export const uploadPromotion = makeCloudinaryUploader("promotions", 1);
// export const uploadCampaign = makeCloudinaryUploader("campaigns", 1);
// export const uploadBlogImage = makeCloudinaryUploader("blogs", 1);
// export const uploadCommentImage = makeCloudinaryUploader("comments", 1);
// export const uploadCategory = makeCloudinaryUploader("categories", 20);
// export const uploaduserProfile = makeCloudinaryUploader("users", 10);
// export const uploadBrand = makeCloudinaryUploader("brands", 2);
// export const uploadTones = makeCloudinaryUploader("tones", 2);
// export const uploadUndertones = makeCloudinaryUploader("undertones", 2);
// export const uploadFamilies = makeCloudinaryUploader("families", 2);
// export const uploadFormulations = makeCloudinaryUploader("formulations", 2);
// export const uploadSkinType = makeCloudinaryUploader("skin-types", 2);
// export const uploadGiftCard = makeCloudinaryUploader("gift-cards", 1);
// export const uploadSeller = makeCloudinaryUploader("sellers", 100);






import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "./utils/cloudinary.js";

// -------------------- Memory Storage --------------------
const storage = multer.memoryStorage();

// -------------------- Mime Types --------------------
const imageMime = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const videoMime = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];
const pdfMime = ["application/pdf"];

  // -------------------- Generic Cloudinary Upload Function --------------------
  export function uploadToCloudinary(buffer, folder, resource_type = "image") {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

// -------------------- Make Image Uploader --------------------
function makeImageUploader(maxFiles) {
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      if (!imageMime.includes(file.mimetype))
        return cb(new Error("Invalid image file"), false);
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024, files: maxFiles },
  });
}

// -------------------- Make PDF Uploader --------------------
function makePdfUploader(maxFiles) {
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      if (!pdfMime.includes(file.mimetype))
        return cb(new Error("Only PDF files allowed"), false);
      cb(null, true);
    },
    limits: { fileSize: 20 * 1024 * 1024, files: maxFiles },
  });
}

// -------------------- Make Video Uploader --------------------
function makeVideoUploader(maxFiles) {
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      if (!videoMime.includes(file.mimetype))
        return cb(new Error("Invalid video file"), false);
      cb(null, true);
    },
    limits: { fileSize: 100 * 1024 * 1024, files: maxFiles },
  });
}

// -------------------- Product Variant (any images) --------------------
export const uploadProductWithVariants = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!imageMime.includes(file.mimetype))
      return cb(new Error("Invalid image file"), false);
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
}).any();

// -------------------- Universal Media Uploader --------------------
export const uploadMedia = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (![...imageMime, ...videoMime].includes(file.mimetype))
      return cb(new Error("Invalid media file"), false);
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

// -------------------- Video + Thumbnail --------------------
export const uploadVideoWithThumbnail = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // normalize mimetype for webp edge cases
    const mime = file.mimetype.split(";")[0];
    if (file.fieldname === "video" && videoMime.includes(mime)) return cb(null, true);
    if (file.fieldname === "thumbnail" && imageMime.includes(mime)) return cb(null, true);
    return cb(new Error(`Invalid file for ${file.fieldname}`), false);
  },
  limits: { fileSize: 100 * 1024 * 1024, files: 2 },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);


export const uploadMultipleToCloudinary = async (files, folder) => {
  try {
    if (!files || files.length === 0) return [];

    const uploaded = [];

    for (const file of files) {
      const result = await uploadToCloudinary(file.buffer, folder); 
      uploaded.push(result.secure_url);
    }

    return uploaded;

  } catch (err) {
    console.error("Cloudinary Upload Error →", err);
    return [];
  }
};

// -------------------- All Uploaders Export --------------------
export const uploadProduct = makeImageUploader(25);
export const uploadCampaign = makeImageUploader(1);
export const uploadBlogImage = makeImageUploader(1);
export const uploadCommentImage = makeImageUploader(1);
export const uploadCategory = makeImageUploader(20);
export const uploaduserProfile = makeImageUploader(10);
export const uploadBrand = makeImageUploader(2);
export const uploadTones = makeImageUploader(6);
export const uploadUndertones = makeImageUploader(1);
export const uploadFamilies = makeImageUploader(1);
export const uploadFormulations = makeImageUploader(2);
export const uploadSkinType = makeImageUploader(2);
export const uploadGiftCard = makeImageUploader(1);
export const uploadSeller = makeImageUploader(100);
export const uploadAdminProfile = makeImageUploader(2);
export const uploadRefund = makeImageUploader(5);
export const uploadReview = makeImageUploader(5);