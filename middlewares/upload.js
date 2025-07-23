// middleware/upload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads/campaigns folder exists
const dir = 'uploads/campaigns';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/campaigns');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueName + ext);
  }
});

const upload = multer({ storage });

export default upload;
