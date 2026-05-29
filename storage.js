// src/utils/storage.js
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, PNG, and WEBP are allowed.'), false);
  }
};

// Upload to S3
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, { uploadedBy: req.user?.userId || 'anonymous' });
    },
    key: (req, file, cb) => {
      const folder = req.uploadFolder || 'documents';
      const ext = path.extname(file.originalname);
      const key = `${folder}/${uuidv4()}${ext}`;
      cb(null, key);
    },
  }),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Generate a presigned download URL (valid 1 hour)
const getPresignedUrl = async (key) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
};

// Delete a file from S3
const deleteFile = async (key) => {
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  }));
};

// Extract S3 key from full URL
const keyFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.slice(1); // remove leading /
  } catch {
    return url;
  }
};

module.exports = { upload, getPresignedUrl, deleteFile, keyFromUrl };
