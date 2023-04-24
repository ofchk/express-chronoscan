const util = require('util');
const multer = require('multer');
const fs = require('fs');
const maxSize = 20 * 1024 * 1024;

let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const number = file.invoice_number;
    const dir = __basedir + '/invoices/' + number;
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) throw err;
    });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

let uploadFile = multer({
  storage: storage,
  limits: { fileSize: maxSize },
}).single('file');

let uploadFileMiddleware = util.promisify(uploadFile);
module.exports = uploadFileMiddleware;
