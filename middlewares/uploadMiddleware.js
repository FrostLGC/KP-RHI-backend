const multer = require('multer');

// mengatur penyimpanan file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // folder tempat menyimpan file
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`)// nama file yang disimpan
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true); // file diterima
    } else {
        cb(new Error('Invalid file type, only JPEG, PNG and PDF are allowed!'), false); // file ditolak
    }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
